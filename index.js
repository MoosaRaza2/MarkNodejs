const express = require("express");
const Shopify = require("shopify-api-node");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_PASSWORD,
});

const createProductWithImage = async (title, price, description = "", vendor = "", imageUrl = "") => {
  try {
    // Prepare product data for REST API
    const productData = {
      product: {
        title: title,
        body_html: description,
        vendor: vendor,
        published: true, // Publish to online store
        status: "active", // Make sure product is active
        variants: [
          {
            price: parseFloat(price).toFixed(2),
            inventory_management: null, // Don't track inventory
            inventory_policy: "continue" // Allow purchases even if out of stock
          }
        ]
      }
    };

    // Add image if provided
    if (imageUrl && imageUrl.trim() !== "") {
      productData.product.images = [
        {
          src: imageUrl,
          alt: title
        }
      ];
    }

    // Create product using REST API
    const product = await shopify.product.create(productData.product);
    
    // Format response to match GraphQL structure for consistency
    const formattedResponse = {
      productCreate: {
        product: {
          id: `gid://shopify/Product/${product.id}`,
          title: product.title,
          handle: product.handle,
          descriptionHtml: product.body_html,
          vendor: product.vendor,
          images: {
            nodes: product.images?.map(img => ({
              id: `gid://shopify/ProductImage/${img.id}`,
              url: img.src,
              altText: img.alt
            })) || []
          },
          variants: {
            nodes: product.variants?.map(variant => ({
              id: `gid://shopify/ProductVariant/${variant.id}`,
              title: variant.title,
              price: variant.price,
              sku: variant.sku
            })) || []
          }
        },
        userErrors: []
      }
    };
    
    return formattedResponse;
  } catch (error) {
    console.error("Error creating product with REST API:", error);
    throw error;
  }
};

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Allow all origins for Heroku
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning");
  res.header("Access-Control-Allow-Credentials", "true");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Shopify Product Creator API is running",
    endpoints: {
      createProduct: "/create-product/:price",
      createProductWithDetails: "/create-product/:price/:title",
      createProductFull: "/create-product-full/:price?title=...&image=...&description=...&vendor=...",
      createProductPost: "POST /create-product"
    },
    examples: {
      basicProduct: "/create-product/29.99",
      productWithTitle: "/create-product/49.99/My%20Product",
      fullProduct: "/create-product-full/79.99?title=Amazing%20Product&image=https://example.com/image.jpg&description=Great%20product&vendor=My%20Brand"
    }
  });
});

// Create product with price only (generates auto title)
app.get("/create-product/:price", async (req, res) => {
  try {
    const price = req.params.price;
    
    // Validate price
    if (isNaN(price) || parseFloat(price) <= 0) {
      return res.status(400).json({ 
        error: "Invalid price. Price must be a positive number." 
      });
    }

    const title = `Product - $${parseFloat(price).toFixed(2)}`;
    const description = `<p>Product created with price $${parseFloat(price).toFixed(2)}</p>`;
    
    const response = await createProductWithImage(title, price, description, "", "");
    
    if (response.productCreate.userErrors && response.productCreate.userErrors.length > 0) {
      return res.status(400).json({ 
        error: "Shopify API Error", 
        details: response.productCreate.userErrors 
      });
    }

    res.json({
      success: true,
      product: response.productCreate.product,
      message: `Product created successfully with price $${parseFloat(price).toFixed(2)}`
    });
    
  } catch (error) {
    console.error("Error in create-product endpoint:", error);
    res.status(500).json({ 
      error: "Failed to create product", 
      details: error.message 
    });
  }
});

// Create product with price and custom title
app.get("/create-product/:price/:title", async (req, res) => {
  try {
    const { price, title } = req.params;
    
    // Validate price
    if (isNaN(price) || parseFloat(price) <= 0) {
      return res.status(400).json({ 
        error: "Invalid price. Price must be a positive number." 
      });
    }

    // Decode title (in case it has URL encoding)
    const decodedTitle = decodeURIComponent(title);
    const description = `<p>${decodedTitle} - Price: $${parseFloat(price).toFixed(2)}</p>`;
    
    const response = await createProductWithImage(decodedTitle, price, description, "", "");
    
    if (response.productCreate.userErrors && response.productCreate.userErrors.length > 0) {
      return res.status(400).json({ 
        error: "Shopify API Error", 
        details: response.productCreate.userErrors 
      });
    }

    res.json({
      success: true,
      product: response.productCreate.product,
      message: `Product "${decodedTitle}" created successfully with price $${parseFloat(price).toFixed(2)}`
    });
    
  } catch (error) {
    console.error("Error in create-product endpoint:", error);
    res.status(500).json({ 
      error: "Failed to create product", 
      details: error.message 
    });
  }
});

// Create product with price, title, and image via query parameters
app.get("/create-product-full/:price", async (req, res) => {
  try {
    const price = req.params.price;
    const { title, image, description, vendor } = req.query;
    
    // Validate price
    if (isNaN(price) || parseFloat(price) <= 0) {
      return res.status(400).json({ 
        error: "Invalid price. Price must be a positive number." 
      });
    }

    // Use provided title or generate default
    const productTitle = title ? decodeURIComponent(title) : `Product - $${parseFloat(price).toFixed(2)}`;
    
    // Use provided description or generate default
    const productDescription = description ? 
      decodeURIComponent(description) : 
      `<p>${productTitle} - Price: $${parseFloat(price).toFixed(2)}</p>`;
    
    const productVendor = vendor ? decodeURIComponent(vendor) : "";
    
    const response = await createProductWithImage(productTitle, price, productDescription, productVendor, image);
    
    if (response.productCreate.userErrors && response.productCreate.userErrors.length > 0) {
      return res.status(400).json({ 
        error: "Shopify API Error", 
        details: response.productCreate.userErrors 
      });
    }

    res.json({
      success: true,
      product: response.productCreate.product,
      message: `Product "${productTitle}" created successfully with price $${parseFloat(price).toFixed(2)}${image ? ' and image' : ''}`
    });
    
  } catch (error) {
    console.error("Error in create-product-full endpoint:", error);
    res.status(500).json({ 
      error: "Failed to create product", 
      details: error.message 
    });
  }
});

// POST endpoint for more detailed product creation
app.post("/create-product", async (req, res) => {
  try {
    const { price, title, description, vendor } = req.body;
    
    // Validate required fields
    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      return res.status(400).json({ 
        error: "Invalid or missing price. Price must be a positive number." 
      });
    }

    if (!title || title.trim() === "") {
      return res.status(400).json({ 
        error: "Title is required." 
      });
    }
    
    const response = await createProductWithImage(
      title.trim(), 
      price, 
      description || `<p>${title.trim()} - Price: $${parseFloat(price).toFixed(2)}</p>`,
      vendor || "",
      "" // No image for POST endpoint, but using same function for consistency
    );
    
    if (response.productCreate.userErrors && response.productCreate.userErrors.length > 0) {
      return res.status(400).json({ 
        error: "Shopify API Error", 
        details: response.productCreate.userErrors 
      });
    }

    res.json({
      success: true,
      product: response.productCreate.product,
      message: `Product "${title.trim()}" created successfully with price $${parseFloat(price).toFixed(2)}`
    });
    
  } catch (error) {
    console.error("Error in POST create-product endpoint:", error);
    res.status(500).json({ 
      error: "Failed to create product", 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Shopify Product Creator App is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Shopify Store: ${process.env.SHOPIFY_SHOP_NAME || 'Not configured'}`);
});
