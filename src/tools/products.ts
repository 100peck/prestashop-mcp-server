import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PrestaShopClient } from "../prestashop-client.js";

export function registerProductTools(server: McpServer, client: PrestaShopClient) {
  server.tool(
    "get_products",
    "Unified product retrieval - supports both single product by ID and multiple products with comprehensive filtering and enhancement options",
    {
      product_id: z.string().optional().describe("Retrieve single product by ID (takes precedence over other params)"),
      limit: z.number().int().optional().default(10).describe("Number of products to retrieve for list queries"),
      category_id: z.string().optional().describe("Filter by category ID"),
      name_filter: z.string().optional().describe("Filter by product name"),
      manufacturer_id: z.string().optional().describe("Filter by manufacturer/brand ID"),
      manufacturer_name: z.string().optional().describe("Filter by manufacturer/brand name (e.g. 'Nike')"),
      include_details: z.boolean().optional().default(false).describe("Include complete product information"),
      include_stock: z.boolean().optional().default(false).describe("Include stock/inventory information"),
      include_category_info: z.boolean().optional().default(false).describe("Include category details"),
      display: z.string().optional().describe("Comma-separated list of specific fields to include (e.g., 'id,name,price')"),
    },
    async (args) => {
      const result = await client.getProducts({
        productId: args.product_id,
        limit: args.limit,
        categoryId: args.category_id,
        nameFilter: args.name_filter,
        manufacturerId: args.manufacturer_id,
        manufacturerName: args.manufacturer_name,
        includeDetails: args.include_details,
        includeStock: args.include_stock,
        includeCategoryInfo: args.include_category_info,
        display: args.display,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "create_product",
    "Create a new product",
    {
      name: z.string().describe("Product name"),
      price: z.number().describe("Product price"),
      description: z.string().optional().describe("Product description"),
      category_id: z.string().optional().describe("Category ID"),
      quantity: z.number().int().optional().describe("Initial stock quantity"),
      reference: z.string().optional().describe("Product reference/SKU"),
      weight: z.number().optional().describe("Product weight"),
    },
    async (args) => {
      const result = await client.createProduct({
        name: args.name,
        price: args.price,
        description: args.description,
        categoryId: args.category_id,
        quantity: args.quantity,
        reference: args.reference,
        weight: args.weight,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_product",
    "Update an existing product",
    {
      product_id: z.string().describe("Product ID to update"),
      name: z.string().optional().describe("New product name"),
      price: z.number().optional().describe("New product price"),
      description: z.string().optional().describe("New product description"),
      category_id: z.string().optional().describe("New category ID"),
      active: z.boolean().optional().describe("Whether product is active"),
    },
    async (args) => {
      const result = await client.updateProduct(args.product_id, {
        name: args.name,
        price: args.price,
        description: args.description,
        categoryId: args.category_id,
        active: args.active,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "delete_product",
    "Delete a product",
    {
      product_id: z.string().describe("Product ID to delete"),
    },
    async (args) => {
      const result = await client.deleteProduct(args.product_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_product_stock",
    "Update product stock quantity",
    {
      product_id: z.string().describe("Product ID"),
      quantity: z.number().int().describe("New stock quantity"),
    },
    async (args) => {
      const result = await client.updateProductStock(args.product_id, args.quantity);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_product_price",
    "Update product price",
    {
      product_id: z.string().describe("Product ID"),
      price: z.number().describe("New price"),
      wholesale_price: z.number().optional().describe("New wholesale price"),
    },
    async (args) => {
      const result = await client.updateProductPrice(args.product_id, args.price, args.wholesale_price);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "duplicate_product",
    "Duplicate an existing product. Copies all fields, stock quantity, and optionally uploads new images from URLs. New product is created as inactive by default.",
    {
      product_id: z.string().describe("ID of the product to duplicate"),
      new_name: z.string().optional().describe("Name for the new product (default: original name + ' (kopie)')"),
      image_urls: z.array(z.string()).optional().describe("List of image URLs to upload to the new product"),
      active: z.boolean().optional().default(false).describe("Whether the new product should be active immediately (default: false)"),
    },
    async (args) => {
      const result = await client.duplicateProduct({
        productId: args.product_id,
        newName: args.new_name,
        imageUrls: args.image_urls,
        active: args.active,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_out_of_stock_label",
    "Update the label shown when a product is out of stock (available_later), optionally the in-stock label (available_now), and the backorder setting (0=deny, 1=allow, 2=shop default)",
    {
      product_id: z.string().describe("Product ID"),
      available_later: z.string().optional().describe("Label shown when product is out of stock and backorders are allowed (e.g. 'Dostupné za 3-5 dní')"),
      available_now: z.string().optional().describe("Label shown when product is in stock (e.g. 'Skladem')"),
      out_of_stock: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("Backorder setting: 0=deny orders, 1=allow orders, 2=use shop default"),
      combination_id: z.string().optional().describe("Target a specific product combination/variant (leave empty for simple products)"),
    },
    async (args) => {
      const result = await client.updateOutOfStockLabel({
        productId: args.product_id,
        availableLater: args.available_later,
        availableNow: args.available_now,
        outOfStock: args.out_of_stock,
        combinationId: args.combination_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upload_product_image",
    "Upload an image to a product. Provide an HTTPS image URL, a local file path (when server runs locally), or a base64 encoded image string.",
    {
      product_id: z.string().describe("Product ID to upload image to"),
      image_url: z.string().optional().describe("HTTPS URL of the image to upload"),
      file_path: z.string().optional().describe("Absolute path to a local image file on the server machine (e.g. /Users/john/image.jpg). Works when MCP server runs locally."),
      base64_data: z.string().optional().describe("Base64 encoded image data (with or without data URI prefix)"),
      mime_type: z.string().optional().describe("MIME type, e.g. image/jpeg, image/png (default: auto-detected from file extension or image/jpeg)"),
    },
    async (args) => {
      if (!args.image_url && !args.base64_data && !args.file_path) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Provide image_url, file_path, or base64_data" }) }] };
      }
      const result = await client.uploadProductImage(
        args.product_id,
        args.image_url ?? "",
        args.base64_data,
        args.mime_type,
        args.file_path
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_manufacturers",
    "Get list of manufacturers/brands in the shop",
    {
      limit: z.number().int().optional().default(20).describe("Number of manufacturers to retrieve"),
      name_filter: z.string().optional().describe("Filter by manufacturer name"),
    },
    async (args) => {
      const result = await client.getManufacturers(args.limit, args.name_filter);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_unsold_products",
    "Get active products that have not been sold in the last N days",
    {
      days: z.number().int().optional().default(90).describe("Number of days to look back (default 90)"),
      limit: z.number().int().optional().default(10).describe("Maximum number of products to return"),
    },
    async (args) => {
      const result = await client.getUnsoldProducts(args.days, args.limit);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
