

# PrestaShop MCP Server

A professional Model Context Protocol (MCP) Server for complete management of PrestaShop e-commerce stores with **extended functionality**.

## 🚀 Overview

This MCP Server enables complete management of your PrestaShop store through AI applications like Claude Desktop. With specialized tools, you can manage all aspects of your e-commerce business - from products and categories to customers, orders, **modules, cache, themes, and navigation menus**.

## ✨ Features

- **🛍️ Complete Store Management** - Tools for all e-commerce areas
- **🔧 Module Management** - Install, activate, deactivate modules
- **💾 Cache Management** - Clear and monitor cache status
- **🎨 Theme Management** - Configure themes and settings
- **📋 Menu Management** - Manage main navigation (ps_mainmenu)
- **🏗️ MCP Protocol Compliance** for seamless AI integration
- **⚡ Async/Await Architecture** for maximum performance
- **🛡️ Comprehensive Error Handling** and validation
- **🔧 Production-Ready** with complete test suite
- **📖 Comprehensive Documentation** with practical examples

## 🛠️ Available Tools

### 📦 Unified Product Management
- `get_products` - **UNIFIED** Product retrieval supporting all use cases:
  - **Single Product by ID**: Complete product details including stock and category info
  - **Multiple Products**: List with optional filtering and enhancement
  - **Flexible Enhancement**: Optional stock info, category details, custom field selection
  - **Smart Filtering**: By category, name, or custom criteria
- `create_product` - Create new products with complete configuration
- `update_product` - Edit product information
- `delete_product` - Remove products
- `update_product_stock` - Manage inventory levels
- `update_product_price` - Update pricing

### 🏷️ Category Management
- `get_categories` - Retrieve categories (with hierarchy filter)
- `create_category` - Create new categories
- `update_category` - Edit categories
- `delete_category` - Remove categories

### 👥 Customer Management
- `get_customers` - Retrieve and filter customers
- `create_customer` - Create new customers
- `update_customer` - Edit customer data

### 📋 Order Management
- `get_orders` - Retrieve and filter orders
- `update_order_status` - Change order status
- `get_order_states` - Retrieve available statuses

### 🔧 Module Management **NEW**
- `get_modules` - List all PrestaShop modules
- `get_module_by_name` - Get specific module details
- `install_module` - Install new modules
- `update_module_status` - Activate/deactivate modules

### 📋 Main Menu Management **NEW**
- `get_main_menu_links` - Retrieve ps_mainmenu navigation links
- `update_main_menu_link` - Edit existing menu links
- `add_main_menu_link` - Add new navigation links

### 💾 Cache Management **NEW**
- `clear_cache` - Clear PrestaShop cache (all types)
- `get_cache_status` - Monitor cache configuration

### 🎨 Theme Management **NEW**
- `get_themes` - Get current theme information
- `update_theme_setting` - Configure theme settings

### ⚙️ Store Administration
- `test_connection` - Test API connection
- `get_shop_info` - Comprehensive store statistics

## 📋 Installation

### ⚠️ Recommended Installation (Virtual Environment)

**This approach prevents module conflicts and ensures reliable installation:**

#### Windows:
```powershell
# Clone repository
git clone https://github.com/latinogino/prestashop-mcp.git
cd prestashop-mcp

# Create virtual environment
python -m venv venv_prestashop

# Activate virtual environment
.\venv_prestashop\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Install package in development mode
pip install -e .

# Verify installation
python -c "import prestashop_mcp; print('✅ Installation successful')"

# Note the Python path for Claude Desktop configuration
Write-Host "Python Path: $((Get-Command python).Source)"
```

#### Linux/macOS:
```bash
# Clone repository
git clone https://github.com/latinogino/prestashop-mcp.git
cd prestashop-mcp

# Create virtual environment
python3 -m venv venv_prestashop

# Activate virtual environment
source venv_prestashop/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install package in development mode
pip install -e .

# Verify installation
python -c "import prestashop_mcp; print('✅ Installation successful')"

# Note the Python path for Claude Desktop configuration
which python
```

### ⚙️ Configuration

Create a `.env` file based on `.env.example`:

```bash
# PrestaShop Configuration
PRESTASHOP_SHOP_URL=https://your-shop.example.com
PRESTASHOP_API_KEY=YOUR_API_KEY

# Logging
LOG_LEVEL=INFO
```

## 🎯 Usage

### 🤖 With Claude Desktop

#### Using Virtual Environment (Recommended)

Add this configuration to `claude_desktop_config.json`:

**Windows:**
```json
{
  "mcpServers": {
    "prestashop": {
      "command": "C:\\\\path\\\\to\\\\prestashop-mcp\\\\venv_prestashop\\\\Scripts\\\\python.exe",
      "args": ["-m", "prestashop_mcp.prestashop_mcp_server"],
      "cwd": "C:\\\\path\\\\to\\\\prestashop-mcp",
      "env": {
        "PRESTASHOP_SHOP_URL": "https://your-shop.example.com",
        "PRESTASHOP_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Linux/macOS:**
```json
{
  "mcpServers": {
    "prestashop": {
      "command": "/path/to/prestashop-mcp/venv_prestashop/bin/python",
      "args": ["-m", "prestashop_mcp.prestashop_mcp_server"],
      "cwd": "/path/to/prestashop-mcp",
      "env": {
        "PRESTASHOP_SHOP_URL": "https://your-shop.example.com",
        "PRESTASHOP_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### 💻 CLI Usage

```bash
# Activate virtual environment first (if using venv)
source venv_prestashop/bin/activate  # Linux/macOS
.\venv_prestashop\Scripts\Activate.ps1  # Windows

# With environment variables
prestashop-mcp

# With direct parameters
prestashop-mcp --shop-url https://your-shop.com --api-key YOUR_API_KEY

# Debug mode
prestashop-mcp --log-level DEBUG
```

## 🆕 Extended Functionality Examples

### **Module Management**
```
"Show me all modules in my PrestaShop store"
"Activate the ps_mainmenu module"
"Deactivate the blockcart module"
"Get details for the ps_featuredproducts module"
```

### **Main Menu Management**
```
"Show me all main menu links"
"Add a new menu link called 'Special Offers' pointing to /special-offers"
"Update menu link 3 to point to /new-products"
"Make menu link 5 inactive"
```

### **Cache Management**
```
"Clear all PrestaShop cache"
"Show me the current cache status"
"Check if CSS cache is enabled"
```

### **Theme Management**
```
"Show me current theme settings"
"Update the PS_LOGO setting to /img/new-logo.png"
"Change the PS_THEME_NAME to my-custom-theme"
```

## 🆕 Unified Product API

The `get_products` tool handles **all product retrieval scenarios** with a single, powerful interface:

### **Use Cases:**

| Scenario | Parameters | Result |
|----------|------------|--------|
| **Single Product Details** | `product_id="15", include_stock=true, include_category_info=true` | Complete product info with stock & category |
| **Product List** | `limit=20, category_id="5"` | List of products in category 5 |
| **Enhanced List** | `limit=10, include_details=true, include_stock=true` | Full product details with stock for 10 products |
| **Filtered Search** | `name_filter="laptop", include_details=true` | All laptop products with complete information |
| **Custom Fields** | `display="id,name,price", limit=50` | Specific fields only for 50 products |

## 🛠️ Advanced Features

### **ps_mainmenu Integration**
The ps_mainmenu module management allows you to:
- Retrieve all main navigation links
- Add custom navigation items
- Update existing menu links (name, URL, status)
- Control menu link positioning

### **Cache Performance Optimization**
Cache management includes:
- Clear all cache types (CSS, JS, Template, General)
- Monitor cache status for performance optimization
- Toggle cache settings for development/production

### **Module Lifecycle Management**
Complete module control:
- List all installed modules with status
- Install new modules programmatically
- Activate/deactivate modules as needed
- Get detailed module information

### **Theme Customization**
Theme management capabilities:
- View current theme configuration
- Update theme-specific settings
- Manage logos and visual elements
- Configure theme-related PrestaShop settings

## 🔧 Troubleshooting

### ❌ Common Issues

#### "ModuleNotFoundError: No module named 'prestashop_mcp'"

**Solution:** Use virtual environment and ensure package is installed:
```bash
# Check if in virtual environment
python -c "import sys; print(sys.prefix)"

# Reinstall package
pip install -e .

# Verify installation
python -c "import prestashop_mcp; print('Module found')"
```

#### Module Management Issues

**Check Module Permissions:**
```bash
# Ensure your API key has module management permissions
curl -u "YOUR_API_KEY:" https://your-shop.com/api/modules?output_format=JSON
```

#### Cache Clear Not Working

**Alternative Cache Clear:**
If the API-based cache clear doesn't work, you may need to:
1. Check PrestaShop permissions for API user
2. Use manual cache clearing in PrestaShop admin
3. Verify cache directory write permissions

### 🔍 Debug Mode

Enable debug logging in Claude Desktop configuration:
```json
{
  "mcpServers": {
    "prestashop": {
      "command": "path/to/python",
      "args": ["-m", "prestashop_mcp.prestashop_mcp_server"],
      "cwd": "path/to/prestashop-mcp",
      "env": {
        "PRESTASHOP_SHOP_URL": "https://your-shop.example.com",
        "PRESTASHOP_API_KEY": "YOUR_API_KEY",
        "LOG_LEVEL": "DEBUG"
      }
    }
  }
}
```

## 📊 Project Structure

```
prestashop-mcp/
├── src/prestashop_mcp/                  # Main Package
│   ├── prestashop_mcp_server.py         # MCP Server (Extended)
│   ├── prestashop_client.py             # PrestaShop API Client (Extended)
│   ├── config.py                        # Configuration Management
│   └── cli.py                          # Command Line Interface
├── tests/                               # All Tests
│   ├── test_config.py                   # Unit Tests
│   └── test_crud_operations.py          # CRUD Integration Tests
├── venv_prestashop/                     # Virtual Environment (after setup)
├── README.md                            # Documentation
├── CHANGELOG.md                         # Version History
├── pyproject.toml                       # Package Configuration
└── requirements.txt                     # All Dependencies
```

## 📖 API Documentation

### PrestaShop API

Complete PrestaShop API documentation:
- **[PrestaShop DevDocs - Webservice](https://devdocs.prestashop-project.org/8/webservice/)**

### Authentication

```bash
curl -u "API_KEY:" https://your-shop.com/api/configurations?output_format=JSON
```

### Important Endpoints

- **Products**: `/api/products`
- **Categories**: `/api/categories`
- **Customers**: `/api/customers`
- **Orders**: `/api/orders`
- **Stock**: `/api/stock_availables`
- **Order Status**: `/api/order_states`
- **Modules**: `/api/modules` **NEW**
- **Configurations**: `/api/configurations` **NEW**

## 🧪 Development

### 🏗️ Development Environment

```bash
# Activate virtual environment
source venv_prestashop/bin/activate  # Linux/macOS
.\venv_prestashop\Scripts\Activate.ps1  # Windows

# All dependencies (including test dependencies) are in requirements.txt
pip install -r requirements.txt

# Run tests
pytest

# Run tests with coverage
pytest --cov=src/prestashop_mcp --cov-report=html

# Run comprehensive integration tests
python tests/test_crud_operations.py
```

## 📖 Resources

- **[PrestaShop Official Documentation](https://devdocs.prestashop-project.org/)**
- **[Model Context Protocol Specification](https://modelcontextprotocol.io/)**
- **[Claude Desktop MCP Integration](https://docs.anthropic.com/)**
- **[GitHub Repository](https://github.com/latinogino/prestashop-mcp)**

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.

## 🏗️ Project Status & Development Notes

### 📋 **Maintenance Status**

**⚠️ Limited Maintenance**: I currently do not plan to actively maintain this repository. The PrestaShop MCP Server was rather a test of how an MCP server can be created without significant own programming experience and largely based on LLMs and MCPs.

### 🧪 **Experimental Nature**

This project served as a **Proof of Concept** for:
- **LLM-Assisted Development**: Development of complex software integration solutions with minimal manual programming
- **MCP Server Architecture**: Practical implementation of the Model Context Protocol specification
- **AI-Driven E-Commerce Integration**: Automated PrestaShop management through natural language
- **No-Code/Low-Code Approach**: Maximum use of AI tools for professional software development

### 🐳 **Planned Docker Distribution**

**Upcoming Features:**
It is still planned to provide the entire MCP server as a **ready-made Docker container** as soon as all functions are implemented as desired.

**Benefits of Docker deployment:**
- ✅ **Zero-Configuration Setup**: Easy installation without complex Python environment
- ✅ **Consistent Environment**: Identical behavior on all platforms
- ✅ **Isolated Dependencies**: No conflicts with local Python installations
- ✅ **Production-Ready**: Optimized for productive use
- ✅ **Auto-Updates**: Easy update to new versions

**Planned Docker usage:**
```bash
# Future Docker installation (planned)
docker pull latinogino/prestashop-mcp:latest
docker run -e PRESTASHOP_SHOP_URL=https://your-shop.com \
           -e PRESTASHOP_API_KEY=your-key \
           -p 8080:8080 \
           latinogino/prestashop-mcp:latest
```

---

**🎯 Manage your complete PrestaShop store including modules, cache, themes, and navigation through natural language with Claude Desktop!**
