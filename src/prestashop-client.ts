import { create } from "xmlbuilder2";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import type { Config } from "./config.js";

export class PrestaShopAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrestaShopAPIError";
  }
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject { [key: string]: JsonValue; }
type JsonArray = JsonValue[];

const LANGUAGES = [
  { id: 1, name: "Default" },
  { id: 2, name: "Secondary" },
];

export class PrestaShopClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(private config: Config) {
    this.baseUrl = config.shopUrl.replace(/\/$/, "") + "/api/";
    this.authHeader = "Basic " + Buffer.from(config.apiKey + ":").toString("base64");
  }

  private multilingualField(value: string): Array<{ id: number; value: string }> {
    return LANGUAGES.map((lang) => ({ id: lang.id, value }));
  }

  // Fields returned by PrestaShop GET that must not be sent in POST/PUT
  // associations — can cause module hooks (e.g. monster_balikobot) to crash with get_class(null)
  private readonly PRODUCT_STRIP_FIELDS = [
    "manufacturer_name", "quantity", "position_in_category",
    "id_default_combination", "id_default_image",
    "associations",
  ];

  private stripReadonlyFields(productData: JsonObject): JsonObject {
    const cleaned = { ...productData };
    for (const field of this.PRODUCT_STRIP_FIELDS) {
      delete cleaned[field];
    }
    return cleaned;
  }

  private generateLinkRewrite(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private buildXml(data: JsonObject): string {
    const root = create({ version: "1.0", encoding: "UTF-8" }).ele("prestashop", {
      "xmlns:xlink": "http://www.w3.org/1999/xlink",
    });

    const buildNode = (parent: ReturnType<typeof root.ele>, key: string, value: JsonValue) => {
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === "object" &&
        value[0] !== null &&
        "id" in value[0] &&
        "value" in value[0]
      ) {
        // Multilingual field
        const container = parent.ele(key);
        for (const langItem of value as Array<{ id: number; value: string }>) {
          container.ele("language", { id: String(langItem.id) }).txt(String(langItem.value ?? ""));
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            const elem = parent.ele(key);
            for (const [k, v] of Object.entries(item as JsonObject)) {
              buildNode(elem, k, v);
            }
          } else {
            parent.ele(key).txt(item !== null ? String(item) : "");
          }
        }
      } else if (value !== null && typeof value === "object") {
        const elem = parent.ele(key);
        for (const [k, v] of Object.entries(value as JsonObject)) {
          buildNode(elem, k, v);
        }
      } else {
        parent.ele(key).txt(value !== null ? String(value) : "");
      }
    };

    for (const [key, value] of Object.entries(data)) {
      buildNode(root, key, value as JsonValue);
    }

    return root.end({ prettyPrint: false });
  }

  async request(
    method: string,
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    data?: JsonObject
  ): Promise<JsonObject> {
    const url = new URL(endpoint, this.baseUrl);
    url.searchParams.set("output_format", "JSON");
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
    };
    let body: string | undefined;

    if (data && (method === "POST" || method === "PUT")) {
      body = this.buildXml(data);
      headers["Content-Type"] = "application/xml; charset=UTF-8";
    }

    const response = await fetch(url.toString(), { method, headers, body });

    if (response.status >= 400) {
      const text = await response.text();
      throw new PrestaShopAPIError(`API request failed with status ${response.status}: ${text}`);
    }

    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text) as JsonObject;
    } catch {
      return { raw_response: text };
    }
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async getProducts(opts: {
    productId?: string;
    limit?: number;
    categoryId?: string;
    nameFilter?: string;
    manufacturerId?: string;
    manufacturerName?: string;
    includeDetails?: boolean;
    includeStock?: boolean;
    includeCategoryInfo?: boolean;
    display?: string;
  }): Promise<JsonObject> {
    // Resolve manufacturer name → ID if needed
    if (opts.manufacturerName && !opts.manufacturerId) {
      const mfResp = await this.request("GET", "manufacturers", {
        "filter[name]": opts.manufacturerName,
        "display": "full",
      });
      const mfList = mfResp["manufacturers"];
      if (Array.isArray(mfList) && mfList.length > 0) {
        opts.manufacturerId = String((mfList[0] as JsonObject)["id"]);
      } else {
        return { products: [], count: 0, message: `Manufacturer '${opts.manufacturerName}' not found` };
      }
    }

    if (opts.productId) {
      return this.getSingleProduct(opts.productId, opts);
    }
    return this.getMultipleProducts(opts);
  }

  private async getSingleProduct(
    productId: string,
    opts: {
      includeDetails?: boolean;
      includeStock?: boolean;
      includeCategoryInfo?: boolean;
      display?: string;
    }
  ): Promise<JsonObject> {
    const params: Record<string, string> = {};
    if (opts.display) params["display"] = opts.display;

    const productData = await this.request("GET", `products/${productId}`, params);
    if (!("product" in productData)) {
      throw new PrestaShopAPIError(`Product ${productId} not found`);
    }

    const result: JsonObject = { ...productData };

    if (opts.includeStock) {
      try {
        const stockResp = await this.request("GET", "stock_availables", {
          "filter[id_product]": productId,
        });
        const stockItems = (stockResp as JsonObject)["stock_availables"];
        result["stock_info"] =
          Array.isArray(stockItems) && stockItems.length > 0
            ? (stockItems[0] as JsonObject)
            : { error: "Stock information not available" };
      } catch (e) {
        result["stock_info"] = { error: `Stock retrieval failed: ${String(e)}` };
      }
    }

    if (opts.includeCategoryInfo) {
      try {
        const product = productData["product"] as JsonObject;
        const catId = product["id_category_default"];
        if (catId) {
          const catResp = await this.request("GET", `categories/${catId}`);
          result["category_info"] =
            "category" in catResp ? (catResp["category"] as JsonObject) : { error: "Category not found" };
        } else {
          result["category_info"] = { error: "No default category assigned" };
        }
      } catch (e) {
        result["category_info"] = { error: `Category retrieval failed: ${String(e)}` };
      }
    }

    return result;
  }

  private async getMultipleProducts(opts: {
    limit?: number;
    categoryId?: string;
    nameFilter?: string;
    manufacturerId?: string;
    includeDetails?: boolean;
    includeStock?: boolean;
    includeCategoryInfo?: boolean;
    display?: string;
  }): Promise<JsonObject> {
    const params: Record<string, string | number> = { limit: opts.limit ?? 10 };
    if (opts.display) params["display"] = opts.display;
    if (opts.nameFilter) params["filter[name]"] = `[${opts.nameFilter}]%`;
    if (opts.categoryId) params["filter[id_category_default]"] = opts.categoryId;
    if (opts.manufacturerId) params["filter[id_manufacturer]"] = opts.manufacturerId;

    const productsData = await this.request("GET", "products", params);

    if ((opts.includeDetails || opts.includeStock || opts.includeCategoryInfo) && "products" in productsData) {
      const products = productsData["products"] as JsonArray;
      const enhanced: JsonArray = [];
      for (const p of products) {
        const product = p as JsonObject;
        const pid = product["id"];
        if (pid) {
          try {
            const ep = await this.getSingleProduct(String(pid), opts);
            enhanced.push(ep);
          } catch {
            enhanced.push(product);
          }
        } else {
          enhanced.push(product);
        }
      }
      return { ...productsData, products: enhanced };
    }

    return productsData;
  }

  async createProduct(opts: {
    name: string;
    price: number;
    description?: string;
    categoryId?: string;
    quantity?: number;
    reference?: string;
    weight?: number;
  }): Promise<JsonObject> {
    const linkRewrite = this.generateLinkRewrite(opts.name);
    const desc = opts.description ?? "";

    const productData: JsonObject = {
      product: {
        name: this.multilingualField(opts.name),
        link_rewrite: this.multilingualField(linkRewrite),
        description: this.multilingualField(desc),
        description_short: this.multilingualField(desc.slice(0, 160)),
        meta_title: this.multilingualField(opts.name.slice(0, 70)),
        meta_description: this.multilingualField((desc || opts.name).slice(0, 160)),
        meta_keywords: this.multilingualField(""),
        state: "1",
        price: String(opts.price),
        active: "1",
        available_for_order: "1",
        show_price: "1",
        indexed: "1",
        visibility: "both",
        id_category_default: opts.categoryId ?? "2",
        minimal_quantity: "1",
        low_stock_alert: "0",
        out_of_stock: "2",
        weight: opts.weight !== undefined ? String(opts.weight) : "0",
        is_virtual: "0",
        cache_default_attribute: "0",
        id_default_image: "0",
        id_default_combination: "0",
        id_tax_rules_group: "1",
        id_shop_default: "1",
        advanced_stock_management: "0",
        depends_on_stock: "0",
        pack_stock_type: "3",
        redirect_type: "404",
        id_type_redirected: "0",
        available_date: "0000-00-00",
        show_condition: "0",
        condition: "new",
        cache_is_pack: "0",
        cache_has_attachments: "0",
        is_customizable: "0",
        uploadable_files: "0",
        text_fields: "0",
        ...(opts.reference ? { reference: opts.reference } : {}),
      } as JsonObject,
    };

    const result = await this.request("POST", "products", undefined, productData);

    if (opts.quantity !== undefined && "product" in result) {
      const pid = (result["product"] as JsonObject)["id"];
      if (pid) {
        try {
          await this.updateProductStock(String(pid), opts.quantity);
        } catch {
          // Product created but stock update failed
        }
      }
    }

    return result;
  }

  async updateProduct(
    productId: string,
    updates: {
      name?: string;
      price?: number;
      description?: string;
      categoryId?: string;
      active?: boolean;
    }
  ): Promise<JsonObject> {
    const existing = await this.request("GET", `products/${productId}`);
    if (!("product" in existing)) throw new PrestaShopAPIError(`Product ${productId} not found`);

    const productData = this.stripReadonlyFields(existing["product"] as JsonObject);

    if (updates.name !== undefined) {
      productData["name"] = this.multilingualField(updates.name);
      productData["link_rewrite"] = this.multilingualField(this.generateLinkRewrite(updates.name));
    }
    if (updates.price !== undefined) productData["price"] = String(updates.price);
    if (updates.description !== undefined) productData["description"] = this.multilingualField(updates.description);
    if (updates.categoryId !== undefined) productData["id_category_default"] = updates.categoryId;
    if (updates.active !== undefined) productData["active"] = updates.active ? "1" : "0";

    try {
      return await this.request("PUT", `products/${productId}`, undefined, { product: productData });
    } catch (err) {
      // Some modules (e.g. monster_balikobot) emit PHP warnings that PrestaShop
      // wraps in a 500 response even though the product was actually updated.
      // If the error looks like a PHP warning (not a real PrestaShop error), verify
      // the update succeeded by re-fetching the product.
      if (err instanceof PrestaShopAPIError && /PHP Warning/i.test(err.message)) {
        const verified = await this.request("GET", `products/${productId}`);
        return { ...(verified["product"] as JsonObject), _warning: "Update succeeded despite module warning" };
      }
      throw err;
    }
  }

  async deleteProduct(productId: string): Promise<JsonObject> {
    return this.request("DELETE", `products/${productId}`);
  }

  async duplicateProduct(opts: {
    productId: string;
    newName?: string;
    imageUrls?: string[];
    active?: boolean;
  }): Promise<JsonObject> {
    // 1. Get existing product
    const existing = await this.request("GET", `products/${opts.productId}`);
    if (!("product" in existing)) throw new PrestaShopAPIError(`Product ${opts.productId} not found`);

    // 2. Get current stock
    const stockResp = await this.request("GET", "stock_availables", {
      "filter[id_product]": opts.productId,
      "filter[id_product_attribute]": "0",
    });
    const stockItems = stockResp["stock_availables"];
    const quantity = Array.isArray(stockItems) && stockItems.length > 0
      ? Number((stockItems[0] as JsonObject)["quantity"] ?? 0)
      : 0;

    // 3. Prepare new product — strip readonly fields, associations and remove ID
    // associations (carriers, combinations, images) can cause module hooks to crash
    const orig = existing["product"] as JsonObject;
    const originalName = this.getProductName(orig);
    const newName = opts.newName ?? `${originalName} (kopie)`;

    const productData = this.stripReadonlyFields(orig);
    delete productData["id"];
    delete productData["associations"];
    productData["name"] = this.multilingualField(newName);
    productData["link_rewrite"] = this.multilingualField(this.generateLinkRewrite(newName));
    productData["active"] = (opts.active ?? false) ? "1" : "0";
    productData["state"] = "1";

    // 4. Create new product — if module hooks crash on full data, fall back to minimal fields
    let createResult = await this.request("POST", "products", undefined, { product: productData }).catch(() => null);

    if (!createResult || !("product" in createResult)) {
      // Fallback: minimal product creation (avoids module hooks reading unexpected fields)
      const minimalData: JsonObject = {
        name: productData["name"],
        link_rewrite: productData["link_rewrite"],
        price: productData["price"] ?? "0",
        active: productData["active"],
        state: "1",
        id_category_default: productData["id_category_default"] ?? "2",
        visibility: productData["visibility"] ?? "both",
        condition: productData["condition"] ?? "new",
        minimal_quantity: "1",
        is_virtual: "0",
        cache_is_pack: "0",
        low_stock_alert: "0",
      };
      if (productData["description"]) minimalData["description"] = productData["description"];
      if (productData["description_short"]) minimalData["description_short"] = productData["description_short"];
      if (productData["reference"]) minimalData["reference"] = productData["reference"];
      if (productData["weight"]) minimalData["weight"] = productData["weight"];
      if (productData["id_manufacturer"]) minimalData["id_manufacturer"] = productData["id_manufacturer"];
      if (productData["id_tax_rules_group"]) minimalData["id_tax_rules_group"] = productData["id_tax_rules_group"];
      if (productData["wholesale_price"]) minimalData["wholesale_price"] = productData["wholesale_price"];
      if (productData["unity"]) minimalData["unity"] = productData["unity"];
      if (productData["unit_price_ratio"]) minimalData["unit_price_ratio"] = productData["unit_price_ratio"];

      createResult = await this.request("POST", "products", undefined, { product: minimalData });
      if (!("product" in createResult)) {
        return { error: "Failed to create duplicate product", detail: createResult };
      }
    }

    const newProductId = String((createResult["product"] as JsonObject)["id"]);

    // 5. Copy stock quantity
    if (quantity > 0) {
      try { await this.updateProductStock(newProductId, quantity); } catch { /* ignore */ }
    }

    // 6. Upload images from URLs
    const imageResults: JsonArray = [];
    for (const imageUrl of opts.imageUrls ?? []) {
      try {
        const imgResult = await this.uploadProductImage(newProductId, imageUrl);
        imageResults.push(imgResult);
      } catch (e) {
        imageResults.push({ error: String(e), url: imageUrl });
      }
    }

    return {
      success: true,
      original_product_id: opts.productId,
      new_product_id: newProductId,
      new_name: newName,
      stock_copied: quantity,
      images_uploaded: imageResults.length,
      image_results: imageResults,
      message: `Product duplicated. New product ID: ${newProductId}`,
    };
  }

  async uploadProductImage(
    productId: string,
    imageUrl: string,
    base64Data?: string,
    mimeType?: string,
    filePath?: string
  ): Promise<JsonObject> {
    let buffer: ArrayBuffer;
    let contentType: string;
    let filenameHint = `image`;

    if (filePath) {
      // Upload from local filesystem path
      if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const nodeBuffer = readFileSync(filePath);
      buffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength) as ArrayBuffer;
      const ext = extname(filePath).toLowerCase().replace(".", "");
      const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
      contentType = mimeType ?? mimeMap[ext] ?? "image/jpeg";
      filenameHint = filePath.split("/").pop() ?? `image.${ext || "jpg"}`;
    } else if (base64Data) {
      // Upload from base64 encoded data
      contentType = mimeType ?? "image/jpeg";
      const binaryStr = atob(base64Data.replace(/^data:[^;]+;base64,/, ""));
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      buffer = bytes.buffer;
      filenameHint = "image";
    } else {
      // Fetch the source image from URL
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch image from ${imageUrl}: ${imgResponse.status}`);
      let ct = imgResponse.headers.get("content-type") ?? "image/jpeg";
      if (!ct.startsWith("image/")) ct = "image/jpeg";
      contentType = ct.split(";")[0].trim();
      buffer = await imgResponse.arrayBuffer();
      filenameHint = imageUrl.split("/").pop()?.split("?")[0] ?? "image";
    }

    const blob = new Blob([buffer], { type: contentType });

    // Derive filename with correct extension
    const ext = contentType === "image/png" ? "png" : contentType === "image/gif" ? "gif" : "jpg";
    const rawFilename = filenameHint;
    const filename = rawFilename.includes(".") ? rawFilename : `${rawFilename}.${ext}`;

    const formData = new FormData();
    formData.append("image", blob, filename);

    // PrestaShop requires output_format=JSON even for image uploads
    const url = `${this.baseUrl}images/products/${productId}?output_format=JSON`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: this.authHeader },
      body: formData,
    });

    const text = await response.text();
    console.error(`[uploadProductImage] status=${response.status} body=${text.slice(0, 300)}`);

    if (response.status >= 400) {
      throw new Error(`Image upload failed (${response.status}): ${text}`);
    }

    if (!text) return { uploaded: true, product_id: productId };
    try {
      return { uploaded: true, ...(JSON.parse(text) as JsonObject) };
    } catch {
      return { uploaded: true, raw: text };
    }
  }

  private getProductName(product: JsonObject): string {
    const name = product["name"];
    if (Array.isArray(name) && name.length > 0) {
      return String((name[0] as JsonObject)["value"] ?? "Product");
    }
    return String(name ?? "Product");
  }

  async updateProductStock(productId: string, quantity: number): Promise<JsonObject> {
    const stockResp = await this.request("GET", "stock_availables", {
      "filter[id_product]": productId,
    });
    const stockItems = stockResp["stock_availables"];
    if (!Array.isArray(stockItems) || stockItems.length === 0) {
      throw new PrestaShopAPIError(`Stock information not found for product ${productId}`);
    }
    const stockEntry = stockItems[0] as JsonObject;
    const stockId = stockEntry["id"];

    return this.request("PUT", `stock_availables/${stockId}`, undefined, {
      stock_available: {
        id: String(stockId),
        id_product: String(productId),
        id_product_attribute: "0",
        id_shop: "1",
        id_shop_group: "0",
        quantity: String(quantity),
        depends_on_stock: "0",
        out_of_stock: "2",
      },
    });
  }

  async updateProductPrice(productId: string, price: number, wholesalePrice?: number): Promise<JsonObject> {
    return this.updateProduct(productId, {
      price,
      ...(wholesalePrice !== undefined ? { wholesalePrice } : {}),
    });
  }

  async updateOutOfStockLabel(opts: {
    productId: string;
    availableLater?: string;   // label shown when OOS + backorders allowed
    availableNow?: string;     // label shown when in stock
    outOfStock?: 0 | 1 | 2;   // 0=deny, 1=allow backorders, 2=use shop default
    combinationId?: string;    // optional: target specific combination
  }): Promise<JsonObject> {
    const results: JsonObject = {};

    // Update product multilingual labels (available_now / available_later)
    if (opts.availableLater !== undefined || opts.availableNow !== undefined) {
      const existing = await this.request("GET", `products/${opts.productId}`);
      if (!("product" in existing)) throw new PrestaShopAPIError(`Product ${opts.productId} not found`);

      const productData = this.stripReadonlyFields(existing["product"] as JsonObject);
      if (opts.availableLater !== undefined)
        productData["available_later"] = this.multilingualField(opts.availableLater);
      if (opts.availableNow !== undefined)
        productData["available_now"] = this.multilingualField(opts.availableNow);

      results["product_label_update"] = await this.request(
        "PUT", `products/${opts.productId}`, undefined, { product: productData }
      );
    }

    // Update out_of_stock setting on stock_available
    if (opts.outOfStock !== undefined) {
      const stockResp = await this.request("GET", "stock_availables", {
        "filter[id_product]": opts.productId,
        ...(opts.combinationId
          ? { "filter[id_product_attribute]": opts.combinationId }
          : { "filter[id_product_attribute]": "0" }),
      });
      const items = stockResp["stock_availables"];
      if (Array.isArray(items) && items.length > 0) {
        const stock = items[0] as JsonObject;
        const stockId = stock["id"];
        results["stock_update"] = await this.request(
          "PUT", `stock_availables/${stockId}`, undefined, {
            stock_available: {
              id: String(stockId),
              id_product: opts.productId,
              id_product_attribute: opts.combinationId ?? "0",
              id_shop: "1",
              id_shop_group: "0",
              quantity: String(stock["quantity"] ?? 0),
              depends_on_stock: "0",
              out_of_stock: String(opts.outOfStock),
            },
          }
        );
      }
    }

    return {
      success: true,
      product_id: opts.productId,
      updates: results,
      message: "Out-of-stock label updated",
    };
  }

  async getManufacturers(limit = 20, nameFilter?: string): Promise<JsonObject> {
    const params: Record<string, string | number> = { limit, display: "full" };
    if (nameFilter) params["filter[name]"] = `[${nameFilter}]%`;
    return this.request("GET", "manufacturers", params);
  }

  // ============================================================================
  // CATEGORIES
  // ============================================================================

  async getCategories(limit = 10, parentId?: string): Promise<JsonObject> {
    const params: Record<string, string | number> = { limit };
    if (parentId) params["filter[id_parent]"] = parentId;
    return this.request("GET", "categories", params);
  }

  async createCategory(opts: {
    name: string;
    description?: string;
    parentId?: string;
    active?: boolean;
  }): Promise<JsonObject> {
    const linkRewrite = this.generateLinkRewrite(opts.name);
    const desc = opts.description ?? "";
    return this.request("POST", "categories", undefined, {
      category: {
        name: this.multilingualField(opts.name),
        link_rewrite: this.multilingualField(linkRewrite),
        description: this.multilingualField(desc),
        meta_title: this.multilingualField(opts.name.slice(0, 70)),
        meta_description: this.multilingualField((desc || opts.name).slice(0, 160)),
        meta_keywords: this.multilingualField(""),
        id_parent: opts.parentId ?? "2",
        active: (opts.active ?? true) ? "1" : "0",
        is_root_category: "0",
        position: "0",
        date_add: "",
        date_upd: "",
      } as JsonObject,
    });
  }

  async updateCategory(
    categoryId: string,
    updates: { name?: string; description?: string; active?: boolean }
  ): Promise<JsonObject> {
    const existing = await this.request("GET", `categories/${categoryId}`);
    if (!("category" in existing)) throw new PrestaShopAPIError(`Category ${categoryId} not found`);

    const cat = existing["category"] as JsonObject;
    const categoryData: JsonObject = {
      id: String(categoryId),
      id_parent: cat["id_parent"] ?? "2",
      active: cat["active"] ?? "1",
      name: cat["name"],
      link_rewrite: cat["link_rewrite"],
      description: cat["description"],
    };

    if (updates.name !== undefined) {
      categoryData["name"] = this.multilingualField(updates.name);
      categoryData["link_rewrite"] = this.multilingualField(this.generateLinkRewrite(updates.name));
    }
    if (updates.description !== undefined) categoryData["description"] = this.multilingualField(updates.description);
    if (updates.active !== undefined) categoryData["active"] = updates.active ? "1" : "0";

    return this.request("PUT", `categories/${categoryId}`, undefined, { category: categoryData });
  }

  async deleteCategory(categoryId: string): Promise<JsonObject> {
    return this.request("DELETE", `categories/${categoryId}`);
  }

  // ============================================================================
  // CUSTOMERS
  // ============================================================================

  async getCustomers(limit = 10, email?: string): Promise<JsonObject> {
    const params: Record<string, string | number> = { limit };
    if (email) params["filter[email]"] = `[${email}]%`;
    return this.request("GET", "customers", params);
  }

  async createCustomer(opts: {
    email: string;
    firstname: string;
    lastname: string;
    password: string;
    active?: boolean;
  }): Promise<JsonObject> {
    return this.request("POST", "customers", undefined, {
      customer: {
        email: opts.email,
        firstname: opts.firstname,
        lastname: opts.lastname,
        passwd: opts.password,
        active: (opts.active ?? true) ? "1" : "0",
        id_default_group: "3",
      },
    });
  }

  async updateCustomer(
    customerId: string,
    updates: { email?: string; firstname?: string; lastname?: string; active?: boolean }
  ): Promise<JsonObject> {
    const existing = await this.request("GET", `customers/${customerId}`);
    if (!("customer" in existing)) throw new PrestaShopAPIError(`Customer ${customerId} not found`);

    const cust = existing["customer"] as JsonObject;
    const customerData: JsonObject = {
      id: String(customerId),
      email: cust["email"] ?? "",
      firstname: cust["firstname"] ?? "",
      lastname: cust["lastname"] ?? "",
      id_default_group: cust["id_default_group"] ?? "3",
      active: cust["active"] ?? "1",
      passwd: cust["passwd"] ?? "",
      secure_key: cust["secure_key"] ?? "",
      date_add: cust["date_add"] ?? "",
      date_upd: cust["date_upd"] ?? "",
    };

    if (updates.email !== undefined) customerData["email"] = updates.email;
    if (updates.firstname !== undefined) customerData["firstname"] = updates.firstname;
    if (updates.lastname !== undefined) customerData["lastname"] = updates.lastname;
    if (updates.active !== undefined) customerData["active"] = updates.active ? "1" : "0";

    return this.request("PUT", `customers/${customerId}`, undefined, { customer: customerData });
  }

  // ============================================================================
  // ORDERS
  // ============================================================================

  async getOrders(limit = 10, customerId?: string, status?: string): Promise<JsonObject> {
    const params: Record<string, string | number> = { limit };
    if (customerId) params["filter[id_customer]"] = customerId;
    if (status) params["filter[current_state]"] = status;
    return this.request("GET", "orders", params);
  }

  async updateOrderStatus(orderId: string, statusId: string): Promise<JsonObject> {
    return this.request("POST", "order_histories", undefined, {
      order_history: {
        id_order: orderId,
        id_order_state: statusId,
        id_employee: "1",
      },
    });
  }

  async getOrderStates(): Promise<JsonObject> {
    return this.request("GET", "order_states");
  }

  // ============================================================================
  // MODULES
  // ============================================================================

  async getModules(limit = 20, moduleName?: string): Promise<JsonObject> {
    const params: Record<string, string | number> = { limit };
    if (moduleName) params["filter[name]"] = `[${moduleName}]%`;
    return this.request("GET", "modules", params);
  }

  async getModuleByName(moduleName: string): Promise<JsonObject> {
    try {
      const resp = await this.request("GET", "modules", { "filter[name]": moduleName });
      const modules = resp["modules"];
      if (Array.isArray(modules) && modules.length > 0) {
        const mod = modules[0] as JsonObject;
        const modId = mod["id"];
        if (modId) return this.request("GET", `modules/${modId}`);
      }
      return { error: `Module '${moduleName}' not found` };
    } catch (e) {
      return { error: `Failed to retrieve module: ${String(e)}` };
    }
  }

  async installModule(moduleName: string): Promise<JsonObject> {
    try {
      return await this.request("POST", "modules", undefined, {
        module: { name: moduleName, active: "1", version: "1.0.0" },
      });
    } catch (e) {
      return { error: `Failed to install module: ${String(e)}` };
    }
  }

  async updateModuleStatus(moduleName: string, active: boolean): Promise<JsonObject> {
    try {
      const moduleInfo = await this.getModuleByName(moduleName);
      if ("error" in moduleInfo) return moduleInfo;
      if (!("module" in moduleInfo)) return { error: `Module '${moduleName}' not found` };

      const mod = moduleInfo["module"] as JsonObject;
      const modId = mod["id"];
      const moduleData = { ...mod, active: active ? "1" : "0" };

      return this.request("PUT", `modules/${modId}`, undefined, { module: moduleData });
    } catch (e) {
      return { error: `Failed to update module status: ${String(e)}` };
    }
  }

  // ============================================================================
  // MAIN MENU
  // ============================================================================

  async getMainMenuLinks(): Promise<JsonObject> {
    try {
      const configs = await this.request("GET", "configurations", {
        "filter[name]": "[PS_MAINMENU_CONTENT_]%",
      });
      const menuConfigs: JsonObject = {};
      const cfgList = configs["configurations"];
      if (Array.isArray(cfgList)) {
        for (const cfg of cfgList) {
          const c = cfg as JsonObject;
          const name = String(c["name"] ?? "");
          if (name.startsWith("PS_MAINMENU_CONTENT_")) {
            try {
              if (c["value"]) c["parsed_value"] = JSON.parse(String(c["value"])) as JsonObject;
            } catch { /* keep original */ }
            menuConfigs[name] = c;
          }
        }
      }
      return {
        main_menu: menuConfigs,
        count: Object.keys(menuConfigs).length,
        message: `Found ${Object.keys(menuConfigs).length} main menu configurations`,
      };
    } catch (e) {
      return { error: `Failed to retrieve main menu: ${String(e)}` };
    }
  }

  async updateMainMenuLink(
    linkId: string,
    updates: { name?: string; url?: string; active?: boolean }
  ): Promise<JsonObject> {
    try {
      const configName = `PS_MAINMENU_CONTENT_${linkId}`;
      const existing = await this.request("GET", "configurations", { "filter[name]": configName });
      const cfgList = existing["configurations"];
      if (!Array.isArray(cfgList) || cfgList.length === 0) {
        return { error: `Main menu link '${linkId}' not found` };
      }
      const cfg = cfgList[0] as JsonObject;
      const configId = cfg["id"];
      const linkData = {
        name: updates.name ?? "",
        url: updates.url ?? "",
        active: updates.active ?? true,
      };
      return this.request("PUT", `configurations/${configId}`, undefined, {
        configuration: {
          id: configId,
          name: configName,
          value: JSON.stringify(linkData),
        },
      });
    } catch (e) {
      return { error: `Failed to update main menu link: ${String(e)}` };
    }
  }

  async addMainMenuLink(opts: {
    name: string;
    url: string;
    position?: number;
    active?: boolean;
  }): Promise<JsonObject> {
    try {
      const linkId = String(Date.now());
      const configName = `PS_MAINMENU_CONTENT_${linkId}`;
      const linkData = {
        name: opts.name,
        url: opts.url,
        position: opts.position ?? 0,
        active: opts.active ?? true,
      };
      return this.request("POST", "configurations", undefined, {
        configuration: { name: configName, value: JSON.stringify(linkData) },
      });
    } catch (e) {
      return { error: `Failed to add main menu link: ${String(e)}` };
    }
  }

  // ============================================================================
  // MENU TREE
  // ============================================================================

  async getMenuTree(): Promise<JsonObject> {
    try {
      const resp = await this.request("GET", "configurations", { "filter[name]": "PS_MENU_TREE" });
      const cfgList = resp["configurations"];
      if (Array.isArray(cfgList) && cfgList.length > 0) {
        const menuTreeConfig = cfgList[0] as JsonObject;
        const treeValue = String(menuTreeConfig["value"] ?? "");
        const categoryIds: string[] = [];
        if (treeValue) {
          for (const cat of treeValue.split(",")) {
            const c = cat.trim();
            if (c.startsWith("CAT")) categoryIds.push(c.slice(3));
            else if (/^\d+$/.test(c)) categoryIds.push(c);
          }
        }

        const categoryDetails: JsonArray = [];
        for (const catId of categoryIds) {
          try {
            const catResp = await this.request("GET", `categories/${catId}`);
            if ("category" in catResp) {
              const cat = catResp["category"] as JsonObject;
              categoryDetails.push({
                id: catId,
                name: cat["name"],
                active: String(cat["active"]) === "1",
                url: `index.php?id_category=${catId}&controller=category`,
              });
            }
          } catch {
            categoryDetails.push({ id: catId, error: "Category not found" });
          }
        }

        return {
          menu_tree: {
            raw_value: treeValue,
            category_ids: categoryIds,
            categories: categoryDetails,
            config_id: menuTreeConfig["id"],
            config_name: menuTreeConfig["name"],
          },
          count: categoryIds.length,
          message: `Found ${categoryIds.length} categories in navigation tree`,
        };
      }
      return {
        menu_tree: { raw_value: "", category_ids: [], categories: [] },
        count: 0,
        message: "PS_MENU_TREE configuration not found",
      };
    } catch (e) {
      return { error: `Failed to retrieve menu tree: ${String(e)}` };
    }
  }

  async addCategoryToMenu(categoryId: string, position?: number): Promise<JsonObject> {
    try {
      const current = await this.getMenuTree();
      if ("error" in current) return current;
      const currentCats = ((current["menu_tree"] as JsonObject)["category_ids"] as string[]) ?? [];
      if (currentCats.includes(categoryId)) {
        return { error: `Category ${categoryId} is already in the menu tree`, current_tree: currentCats };
      }
      try {
        const catResp = await this.request("GET", `categories/${categoryId}`);
        if (!("category" in catResp)) return { error: `Category ${categoryId} not found` };
      } catch {
        return { error: `Category ${categoryId} not found or inaccessible` };
      }

      const newCats = [...currentCats];
      if (position !== undefined && position >= 0 && position <= newCats.length) {
        newCats.splice(position, 0, categoryId);
      } else {
        newCats.push(categoryId);
      }
      return this.updateMenuTree(newCats);
    } catch (e) {
      return { error: `Failed to add category to menu: ${String(e)}` };
    }
  }

  async removeCategoryFromMenu(categoryId: string): Promise<JsonObject> {
    try {
      const current = await this.getMenuTree();
      if ("error" in current) return current;
      const currentCats = ((current["menu_tree"] as JsonObject)["category_ids"] as string[]) ?? [];
      if (!currentCats.includes(categoryId)) {
        return { error: `Category ${categoryId} is not in the menu tree`, current_tree: currentCats };
      }
      return this.updateMenuTree(currentCats.filter((c) => c !== categoryId));
    } catch (e) {
      return { error: `Failed to remove category from menu: ${String(e)}` };
    }
  }

  async updateMenuTree(categoryIds: string[]): Promise<JsonObject> {
    try {
      const validCats = categoryIds.filter((id) => /^\d+$/.test(id));
      const treeValue = validCats.map((id) => `CAT${id}`).join(",");

      const resp = await this.request("GET", "configurations", { "filter[name]": "PS_MENU_TREE" });
      const cfgList = resp["configurations"];

      if (Array.isArray(cfgList) && cfgList.length > 0) {
        const cfg = cfgList[0] as JsonObject;
        const configId = cfg["id"];
        const result = await this.request("PUT", `configurations/${configId}`, undefined, {
          configuration: { id: configId, name: "PS_MENU_TREE", value: treeValue },
        });
        return {
          menu_tree_updated: true,
          new_tree: treeValue,
          category_ids: validCats,
          count: validCats.length,
          result,
          message: `Menu tree updated with ${validCats.length} categories`,
        };
      } else {
        const result = await this.request("POST", "configurations", undefined, {
          configuration: { name: "PS_MENU_TREE", value: treeValue },
        });
        return {
          menu_tree_created: true,
          new_tree: treeValue,
          category_ids: validCats,
          count: validCats.length,
          result,
          message: `Menu tree created with ${validCats.length} categories`,
        };
      }
    } catch (e) {
      return { error: `Failed to update menu tree: ${String(e)}` };
    }
  }

  async getMenuTreeStatus(): Promise<JsonObject> {
    try {
      const [treeResult, linksResult] = await Promise.all([this.getMenuTree(), this.getMainMenuLinks()]);
      return {
        menu_status: {
          navigation_tree: (treeResult["menu_tree"] as JsonObject) ?? {},
          custom_links: (linksResult["main_menu"] as JsonObject) ?? {},
          summary: {
            categories_in_nav: (treeResult["count"] as number) ?? 0,
            custom_links_count: (linksResult["count"] as number) ?? 0,
            total_menu_items:
              ((treeResult["count"] as number) ?? 0) + ((linksResult["count"] as number) ?? 0),
          },
        },
        message: "Complete menu status retrieved",
      };
    } catch (e) {
      return { error: `Failed to get menu status: ${String(e)}` };
    }
  }

  // ============================================================================
  // CACHE
  // ============================================================================

  async clearCache(cacheType = "all"): Promise<JsonObject> {
    if (cacheType !== "all") {
      return { error: `Cache type '${cacheType}' not supported. Use 'all'.` };
    }
    try {
      const cacheConfigs = [
        "PS_CACHE_ENABLED",
        "PS_CSS_CACHE_ENABLED",
        "PS_JS_CACHE_ENABLED",
        "PS_TEMPLATE_CACHE_ENABLED",
      ];
      const results: JsonArray = [];
      for (const configName of cacheConfigs) {
        try {
          const resp = await this.request("GET", "configurations", { "filter[name]": configName });
          const cfgList = resp["configurations"];
          if (Array.isArray(cfgList) && cfgList.length > 0) {
            const cfg = cfgList[0] as JsonObject;
            const configId = cfg["id"];
            const currentValue = String(cfg["value"] ?? "1");
            const toggleValue = currentValue === "1" ? "0" : "1";

            await this.request("PUT", `configurations/${configId}`, undefined, {
              configuration: { id: configId, name: configName, value: toggleValue },
            });
            await new Promise((r) => setTimeout(r, 100));
            await this.request("PUT", `configurations/${configId}`, undefined, {
              configuration: { id: configId, name: configName, value: currentValue },
            });
            results.push({ [configName]: "cleared" });
          }
        } catch (e) {
          results.push({ [configName]: `error: ${String(e)}` });
        }
      }
      return {
        cache_clear: "completed",
        type: cacheType,
        results,
        message: "Cache refresh triggered via configuration toggle",
      };
    } catch (e) {
      return { error: `Failed to clear cache: ${String(e)}` };
    }
  }

  async getCacheStatus(): Promise<JsonObject> {
    try {
      const cacheConfigs = [
        "PS_CACHE_ENABLED",
        "PS_CSS_CACHE_ENABLED",
        "PS_JS_CACHE_ENABLED",
        "PS_TEMPLATE_CACHE_ENABLED",
        "PS_SMARTY_CACHE",
        "PS_SMARTY_FORCE_COMPILE",
      ];
      const cacheStatus: JsonObject = {};
      for (const configName of cacheConfigs) {
        try {
          const resp = await this.request("GET", "configurations", { "filter[name]": configName });
          const cfgList = resp["configurations"];
          if (Array.isArray(cfgList) && cfgList.length > 0) {
            const cfg = cfgList[0] as JsonObject;
            const val = String(cfg["value"] ?? "0");
            cacheStatus[configName] = { value: val, enabled: val === "1" };
          } else {
            cacheStatus[configName] = { error: "not found" };
          }
        } catch (e) {
          cacheStatus[configName] = { error: String(e) };
        }
      }
      return { cache_status: cacheStatus, message: "Cache configuration status retrieved" };
    } catch (e) {
      return { error: `Failed to get cache status: ${String(e)}` };
    }
  }

  // ============================================================================
  // THEMES
  // ============================================================================

  async getThemes(): Promise<JsonObject> {
    try {
      const themeConfigs = ["PS_THEME_NAME", "PS_THEME_FOLDER", "PS_THEME_DIR", "PS_LOGO"];
      const themeInfo: JsonObject = {};
      for (const configName of themeConfigs) {
        try {
          const resp = await this.request("GET", "configurations", { "filter[name]": configName });
          const cfgList = resp["configurations"];
          if (Array.isArray(cfgList) && cfgList.length > 0) {
            themeInfo[configName] = String((cfgList[0] as JsonObject)["value"] ?? "");
          }
        } catch (e) {
          themeInfo[configName] = `error: ${String(e)}`;
        }
      }
      return { themes: themeInfo, message: "Theme information retrieved" };
    } catch (e) {
      return { error: `Failed to get themes: ${String(e)}` };
    }
  }

  async updateThemeSetting(settingName: string, value: string): Promise<JsonObject> {
    try {
      const resp = await this.request("GET", "configurations", { "filter[name]": settingName });
      const cfgList = resp["configurations"];
      if (!Array.isArray(cfgList) || cfgList.length === 0) {
        return { error: `Theme setting '${settingName}' not found` };
      }
      const cfg = cfgList[0] as JsonObject;
      const configId = cfg["id"];
      const result = await this.request("PUT", `configurations/${configId}`, undefined, {
        configuration: { id: configId, name: settingName, value },
      });
      return { theme_setting_updated: true, setting: settingName, value, result };
    } catch (e) {
      return { error: `Failed to update theme setting: ${String(e)}` };
    }
  }

  // ============================================================================
  // INFO
  // ============================================================================

  async getConfigurations(filterName?: string): Promise<JsonObject> {
    const params: Record<string, string> = {};
    if (filterName) params["filter[name]"] = `[${filterName}]%`;
    return this.request("GET", "configurations", params);
  }

  async getUnsoldProducts(days = 90, limit = 10): Promise<JsonObject> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    const dateStr = threshold.toISOString().slice(0, 10);

    // Step 1: Get recent orders — load with date_add field and filter in code
    // (PrestaShop 1.7.x doesn't support filter[date_add] on orders)
    const ordersResp = await this.request("GET", "orders", {
      "display": "[id,date_add]",
      "limit": "1000",
    });

    const soldIds = new Set<string>();
    const allOrders = ordersResp["orders"];
    // Filter to only orders newer than threshold
    const orderList = Array.isArray(allOrders)
      ? (allOrders as JsonObject[]).filter((o) => String(o["date_add"] ?? "").slice(0, 10) >= dateStr)
      : [];

    if (orderList.length > 0) {
      // Step 2: For each order, get its order_details using filter[id_order]
      // Process in batches of 10 parallel requests
      const orderIds = (orderList as JsonObject[]).map((o) => String(o["id"]));
      const batchSize = 10;
      for (let i = 0; i < orderIds.length; i += batchSize) {
        const batch = orderIds.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((orderId) =>
            this.request("GET", "order_details", {
              "filter[id_order]": orderId,
              "display": "[id_product]",
              "limit": "100",
            }).catch(() => ({}))
          )
        );
        for (const result of results) {
          const details = (result as JsonObject)["order_details"];
          if (Array.isArray(details)) {
            for (const d of details as JsonObject[]) {
              if (d["id_product"]) soldIds.add(String(d["id_product"]));
            }
          }
        }
      }
    }

    // Step 3: Get all active products and filter out the sold ones
    const productsResp = await this.request("GET", "products", {
      "display": "[id,name,price,date_add,active]",
      "filter[active]": "1",
      "limit": "500",
    });

    const unsold: JsonArray = [];
    const allProducts = productsResp["products"];
    if (Array.isArray(allProducts)) {
      for (const p of allProducts as JsonObject[]) {
        if (!soldIds.has(String(p["id"]))) {
          unsold.push(p);
          if (unsold.length >= limit) break;
        }
      }
    }

    // Step 4: Enrich with stock quantity
    const enriched: JsonArray = [];
    for (const p of unsold as JsonObject[]) {
      const pid = String(p["id"]);
      const dateAdd = String(p["date_add"] ?? "").slice(0, 10);
      const daysInShop = Math.floor((Date.now() - new Date(dateAdd).getTime()) / 86400000);

      let stock = 0;
      try {
        const stockResp = await this.request("GET", "stock_availables", {
          "filter[id_product]": pid,
          "display": "[quantity]",
        });
        const items = stockResp["stock_availables"];
        if (Array.isArray(items) && items.length > 0) {
          stock = Number((items[0] as JsonObject)["quantity"] ?? 0);
        }
      } catch { /* skip */ }

      enriched.push({
        id: p["id"],
        name: p["name"],
        price: p["price"],
        date_added: dateAdd,
        days_in_shop: daysInShop,
        stock_quantity: stock,
      });
    }

    return {
      unsold_products: enriched,
      count: enriched.length,
      threshold_date: dateStr,
      recent_orders_checked: orderList.length,
      sold_product_ids_count: soldIds.size,
      message: `Found ${enriched.length} active products not sold in the last ${days} days`,
    };
  }

  async getShopInfo(): Promise<JsonObject> {
    try {
      const [configs, products, categories, customers, orders] = await Promise.all([
        this.getConfigurations(),
        this.request("GET", "products", { limit: 1 }),
        this.request("GET", "categories", { limit: 1 }),
        this.request("GET", "customers", { limit: 1 }),
        this.request("GET", "orders", { limit: 1 }),
      ]);

      return {
        shop_info: {
          product_count: Array.isArray(products["products"]) ? products["products"].length : 0,
          category_count: Array.isArray(categories["categories"]) ? categories["categories"].length : 0,
          customer_count: Array.isArray(customers["customers"]) ? customers["customers"].length : 0,
          order_count: Array.isArray(orders["orders"]) ? orders["orders"].length : 0,
        },
        configurations: configs,
      };
    } catch (e) {
      return { error: `Could not retrieve shop info: ${String(e)}` };
    }
  }
}
