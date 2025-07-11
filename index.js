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
    

    // DELETE - Delete a pet
    app.delete("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await petCollection.deleteOne(query);
      res.send(result);
    });

    // PATCH - Mark as Adopted
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
