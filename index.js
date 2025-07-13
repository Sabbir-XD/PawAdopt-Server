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
      const result = await petCollection.insertOne(pet);
      res.send(result);
    });

    // READ - Get pets (filtered by email if provided)
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

   

    //donations-campaigns post
    app.post("/donations-campaigns", async (req, res) => {
      const donation = req.body;
      const result = await donationCollection.insertOne(donation);
      res.send(result);
    });

    // READ - Get donations-campaigns (filtered by email if provided)
    app.get("/donations-campaigns", async (req, res) => {
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
