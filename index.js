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

const createProduct = async (title, price, description = "", vendor = "") => {
  const mutation = `mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
        descriptionHtml
        vendor
        variants(first: 1) {
          nodes {
            id
            title
            price
            sku
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }`;

  const variables = {
    input: {
      title: title,
      descriptionHtml: description,
      vendor: vendor,
      variants: [
        {
          price: parseFloat(price).toFixed(2),
          inventoryManagement: "SHOPIFY",
          inventoryPolicy: "DENY"
        }
      ]
    }
  };

  try {
    const response = await shopify.graphql(mutation, variables);
    return response;
  } catch (error) {
    console.error("Error creating product:", error);
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
      createProductPost: "POST /create-product"
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
    
    const response = await createProduct(title, price, description);
    
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
    
    const response = await createProduct(decodedTitle, price, description);
    
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
    
    const response = await createProduct(
      title.trim(), 
      price, 
      description || `<p>${title.trim()} - Price: $${parseFloat(price).toFixed(2)}</p>`,
      vendor || ""
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
