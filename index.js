const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aqhnkqi.mongodb.net/petAdopt?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Assignment 12 is running");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const userCollection = client.db("PetAdopt").collection("users");
    const petCollection = client.db("PetAdopt").collection("pets");
    const donationCollection = client
      .db("PetAdopt")
      .collection("donations-campaigns");
    const adoptionCollection = client.db("PetAdopt").collection("adoptions");
    const paymentCollection = client
      .db("PetAdopt")
      .collection("donations-payments");

    // Required
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // in your .env
    

    // CREATE - Add a new payment donation
    app.post("/donations-payments", async (req, res) => {
      const donation = req.body;
      const result = await paymentCollection.insertOne(donation);
      res.send(result);
    });

    //get payment
    app.get("/donations-payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // Payment intent route
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe uses cents
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //Middleware Verify if the requester is an admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.headers?.email;
      if (!email) {
        return res
          .status(403)
          .send({ error: "Forbidden: No email in headers" });
      }

      try {
        const user = await userCollection.findOne({ email });
        if (user?.role !== "admin") {
          return res.status(403).send({ error: "Forbidden: Not an admin" });
        }
        next(); // Allow access
      } catch (err) {
        console.error("verifyAdmin error:", err);
        res.status(500).send({ error: "Internal Server Error" });
      }
    };

    //promote admin
    app.patch("/users/admin/:id", verifyAdmin, async (req, res) => {
      const userId = req.params.id;
      try {
        const filter = { _id: new ObjectId(userId) };
        const updateDoc = { $set: { role: "admin" } };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        console.error("Promote admin error:", err);
        res.status(500).send({ error: "Failed to promote user to admin" });
      }
    });

    //create user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //get user
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // GET /users/:email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user || {}); // Send empty object if not found
    });

    //put user
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const update = { $set: { ...user, updatedAt: new Date().toISOString() } };
      const options = { upsert: true };
      const result = await userCollection.updateOne(filter, update, options);
      res.send(result);
    });

    // CREATE - Add a new pet
    app.post("/pets", async (req, res) => {
      const pet = req.body;
      pet.createdAt = new Date().toISOString();
      const result = await petCollection.insertOne(pet);
      res.send(result);
    });

    // READ - Get all pets with pagination and filtering options (search, category, adopted, email) and sorting by createdAt in descending order (default)
    app.get("/pets/all", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const search = req.query.search || "";
        const category = req.query.category || "";
        const adopted = req.query.adopted === "false" ? false : undefined;
        const email = req.query.email;

        const query = {};

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        if (category) {
          query.category = category;
        }

        if (adopted !== undefined) {
          query.adopted = adopted;
        }

        if (email) {
          query.email = email;
        }

        const totalCount = await petCollection.countDocuments(query);

        const pets = await petCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const hasMore = skip + pets.length < totalCount;

        res.send({ pets, hasMore });
      } catch (error) {
        console.error("GET /pets error:", error);
        res.status(500).send({ error: "Failed to fetch pets" });
      }
    });

    app.get("/pets", async (req, res) => {
      const email = req.query.email;
      const query = email ? { email } : {};
      const result = await petCollection.find(query).toArray();
      res.send(result);
    });

    // UPDATE - Update pet details
    app.patch("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData,
      };
      const result = await petCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // READ - Get a specific pet by ID
    app.get("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const pet = await petCollection.findOne(query);
      if (!pet) {
        return res.status(404).send({ message: "Pet not found" });
      }
      res.send(pet);
    });

    // DELETE - Delete a pet
    app.delete("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await petCollection.deleteOne(query);
      res.send(result);
    });

    // PATCH - Mark as pet Adopted
    app.patch("/pets/:id/adopt", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          adopted: true,
        },
      };
      const result = await petCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ✅ Admin-only route to get all pets (no pagination)
    app.get("/pets/admin", verifyAdmin, async (req, res) => {
      try {
        const pets = await petCollection.find().toArray();
        res.send(pets);
      } catch (err) {
        console.error("Admin get all pets error:", err);
        res.status(500).send({ error: "Failed to fetch pets" });
      }
    });

    // Delete a pet (admin only)
    app.delete("/pets/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await petCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.error("Delete pet error:", err);
        res.status(500).send({ error: "Failed to delete pet" });
      }
    });

    // Update a pet (admin only)
    app.patch("/pets/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: updatedData };
        const result = await petCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        console.error("Update pet error:", err);
        res.status(500).send({ error: "Failed to update pet" });
      }
    });

    // Mark pet adopted or not (admin only)
    app.patch("/pets/:id/adopt", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { adopted } = req.body; // expect boolean true or false
      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { adopted } };
        const result = await petCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        console.error("Update adopt status error:", err);
        res.status(500).send({ error: "Failed to update adopt status" });
      }
    });

    //adoption post
    app.post("/adoptions", async (req, res) => {
      const adoption = req.body;
      const result = await adoptionCollection.insertOne(adoption);
      res.send(result);
    });

    //get the adoption
    app.get("/adoptions", async (req, res) => {
      const result = await adoptionCollection.find().toArray();
      res.send(result);
    });

    //donations-campaigns post
    app.post("/donations-campaigns", async (req, res) => {
      const donation = req.body;
      const result = await donationCollection.insertOne(donation);
      res.send(result);
    });

    // READ - Get all donations-campaigns
    app.get("/donations-campaigns", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;

      const skip = (page - 1) * limit;

      const cursor = donationCollection
        .find()
        .sort({ createdAt: -1 }) // descending order
        .skip(skip)
        .limit(limit);

      const campaigns = await cursor.toArray();
      const total = await donationCollection.estimatedDocumentCount();

      const hasMore = page * limit < total;
      const nextPage = page + 1;

      res.send({
        campaigns,
        nextPage,
        hasMore,
      });
    });

    // READ - Get all donations-campaigns by user
    app.get("/donations-campaigns/user", async (req, res) => {
      const email = req.query.email;
      const query = { createdBy: email };
      const result = await donationCollection.find(query).toArray();
      res.send(result);
    });

    // Pause/unpause
    app.patch("/donations-campaigns/:id/pause", async (req, res) => {
      const id = req.params.id;
      const { paused } = req.body;
      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { paused } }
      );
      res.send(result);
    });

    // READ - Get a specific donation campaign by ID
    app.get("/donations-campaigns/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const campaign = await donationCollection.findOne(query);
      if (!campaign) {
        return res.status(404).send({ message: "Campaign not found" });
      }
      res.send(campaign);
    });

    // put donation campaign
    app.put("/donations-campaigns/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData,
      };
      const result = await donationCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("PetAdoption listening to port", port);
});
