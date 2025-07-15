// 🌐 Basic Setup
const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

// 🌐 MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aqhnkqi.mongodb.net/petAdopt?retryWrites=true&w=majority&appName=Cluster0`;

// 🛠️ MongoDB Client Setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ✅ Root Route
app.get("/", (req, res) => {
  res.send("Assignment 12 is running");
});

async function run() {
  try {
    await client.connect();

    // 📦 Collections
    const userCollection = client.db("PetAdopt").collection("users");
    const petCollection = client.db("PetAdopt").collection("pets");
    const donationCollection = client
      .db("PetAdopt")
      .collection("donations-campaigns");
    const adoptionCollection = client.db("PetAdopt").collection("adoptions");
    const paymentCollection = client
      .db("PetAdopt")
      .collection("donations-payments");

    // 💳 Stripe Setup
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    // 🔐 Middleware to verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.headers?.email;
      if (!email)
        return res
          .status(403)
          .send({ error: "Forbidden: No email in headers" });

      const user = await userCollection.findOne({ email });
      if (user?.role !== "admin") {
        return res.status(403).send({ error: "Forbidden: Not an admin" });
      }
      next();
    };

    // 🧑‍💼 USER ROUTES
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const exists = await userCollection.findOne(query);
      if (exists) return res.send({ message: "user already exists" });
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user || {});
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const update = { $set: { ...user, updatedAt: new Date().toISOString() } };
      const options = { upsert: true };
      const result = await userCollection.updateOne(filter, update, options);
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    // 🐶 PET ROUTES
    app.post("/pets", async (req, res) => {
      const pet = req.body;
      pet.createdAt = new Date().toISOString();
      const result = await petCollection.insertOne(pet);
      res.send(result);
    });

    app.get("/pets", async (req, res) => {
      const email = req.query.email;
      const query = email ? { email } : {};
      const result = await petCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/pets/all", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;
      const search = req.query.search || "";
      const category = req.query.category || "";
      const adopted = req.query.adopted === "false" ? false : undefined;
      const email = req.query.email;
      const query = {};

      if (search) query.name = { $regex: search, $options: "i" };
      if (category) query.category = category;
      if (adopted !== undefined) query.adopted = adopted;
      if (email) query.email = email;

      const totalCount = await petCollection.countDocuments(query);
      const pets = await petCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      const hasMore = skip + pets.length < totalCount;

      res.send({ pets, hasMore });
    });

    app.get("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const pet = await petCollection.findOne({ _id: new ObjectId(id) });
      if (!pet) return res.status(404).send({ message: "Pet not found" });
      res.send(pet);
    });

    app.patch("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const update = { $set: req.body };
      const result = await petCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.send(result);
    });

    app.delete("/pets/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await petCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/pets/:id/adopt", async (req, res) => {
      const id = req.params.id;
      const { adopted } = req.body || { adopted: true };
      const result = await petCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { adopted } }
      );
      res.send(result);
    });

    app.get("/pets/admin", verifyAdmin, async (req, res) => {
      const result = await petCollection.find().toArray();
      res.send(result);
    });

    // 🏠 ADOPTION ROUTES
  

    // 💝 DONATION CAMPAIGN ROUTES
    app.post("/donations-campaigns", async (req, res) => {
      const result = await donationCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/donations-campaigns", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;
      const campaigns = await donationCollection
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      const total = await donationCollection.estimatedDocumentCount();
      const hasMore = page * limit < total;
      res.send({ campaigns, nextPage: page + 1, hasMore });
    });

    app.get("/donations-campaigns/user", async (req, res) => {
      const email = req.query.email;
      const result = await donationCollection
        .find({ createdBy: email })
        .toArray();
      res.send(result);
    });

    app.get("/donations-campaigns/:id", async (req, res) => {
      const result = await donationCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!result)
        return res.status(404).send({ message: "Campaign not found" });
      res.send(result);
    });

    app.put("/donations-campaigns/:id", async (req, res) => {
      const result = await donationCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.send(result);
    });

    app.patch("/donations-campaigns/:id/pause", async (req, res) => {
      const result = await donationCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { paused: req.body.paused } }
      );
      res.send(result);
    });

    app.delete("/donations-campaigns/:id", async (req, res) => {
      const result = await donationCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // 💰 DONATION PAYMENT ROUTES
    app.post("/donations-payments", async (req, res) => {
      const result = await paymentCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/donations-payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.get("/donations-payments/user", async (req, res) => {
      const email = req.query.email;
      const result = await paymentCollection
        .find({ donatorEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.delete("/donations-payments/:id", async (req, res) => {
      const result = await paymentCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // 💳 STRIPE PAYMENT INTENT
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // ✅ MongoDB Ping
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");
  } finally {
    // await client.close(); // Optional
  }
}
run().catch(console.dir);

// 🚀 Start Server
app.listen(port, () => {
  console.log("PetAdoption listening on port", port);
});
