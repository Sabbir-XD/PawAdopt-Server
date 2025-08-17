require("dotenv").config();
// 🌐 Basic Setup
const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
// const cookieParser = require("cookie-parser");

app.use(cors());
// app.use(cookieParser());
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

// 🔐 Middleware to verify JWT
const verifyJWT = (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized access" });
    req.user = decoded; // instead of req.decoded
    next();
  });
};

const verifyAdmin = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "admin") {
    return res.status(403).send({ error: "Forbidden: Admins only" });
  }
  next();
};

async function run() {
  try {
    // await client.connect();

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

    // 🧑‍💼 JWT ROUTES
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const dbUser = await userCollection.findOne({ email: user.email });
      if (!dbUser) return res.status(404).send({ error: "User not found" });

      const token = jwt.sign(
        {
          email: dbUser.email,
          role: dbUser.role || "user",
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.send({ success: true, token: token });
    });

    // 🧑‍💼 USER ROUTES
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const exists = await userCollection.findOne(query);
      if (exists) return res.send({ message: "user already exists" });
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const skip = (page - 1) * limit;

        const totalUsers = await userCollection.countDocuments();

        // pagination applied users
        const users = await userCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          users,
          totalUsers,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/users/:email", verifyJWT, async (req, res) => {
      const requestedEmail = req.params.email;
      const authenticatedUser = req.user;

      if (
        authenticatedUser.email !== requestedEmail &&
        authenticatedUser.role !== "admin"
      ) {
        return res.status(403).send({ error: "⛔ Forbidden access" });
      }

      try {
        const user = await userCollection.findOne({ email: requestedEmail });

        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error("❌ Error fetching user:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const update = { $set: { ...user, updatedAt: new Date().toISOString() } };
      const options = { upsert: true };
      const result = await userCollection.updateOne(filter, update, options);
      res.send(result);
    });

    app.patch("/users/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const updateFields = req.body;

      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: updateFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({ message: "User updated successfully", result });
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // app.patch("/users/admin/:id", verifyAdmin, async (req, res) => {
    //   const id = req.params.id;
    //   const result = await userCollection.updateOne(
    //     { _id: new ObjectId(id) },
    //     { $set: { role: "admin" } }
    //   );
    //   res.send(result);
    // });

    // 🛠 PATCH - make someone admin
    app.patch(
      "/users/admin/:id",
      verifyJWT,
      verifyAdmin, // 🔒 only admin can make admin
      async (req, res) => {
        const id = req.params.id;

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "admin" } }
        );

        res.send(result);
      }
    );

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

    app.get("/pets/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const pet = await petCollection.findOne({ _id: new ObjectId(id) });
      if (!pet) return res.status(404).send({ message: "Pet not found" });
      res.send(pet);
    });

    app.patch("/pets/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const update = { $set: req.body };
      const result = await petCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.send(result);
    });

    app.delete("/pets/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await petCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.delete("/pets/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await petCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/pets/:id/adopt", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const pet = await petCollection.findOne({ _id: new ObjectId(id) });

      if (!pet) return res.status(404).send({ error: "Pet not found" });

      // Optional restriction: only owner or admin
      if (pet.email !== req.user.email && req.user.role !== "admin") {
        return res.status(403).send({ error: "Forbidden" });
      }

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
    app.post("/adoptions", async (req, res) => {
      const adoption = req.body;
      adoption.timestamp = new Date().toISOString();
      adoption.status = "pending"; // default status
      const result = await adoptionCollection.insertOne(adoption);
      res.send(result);
    });

    // GET: Get adoption requests based on user's added pets (by email)

    app.get("/adoptions", verifyJWT, async (req, res) => {
      const email = req.query.email; // owner email
      if (!email) return res.status(400).send({ error: "Email required" });

      try {
        const pets = await petCollection
          .find({ email })
          .project({ _id: 1 })
          .toArray();
        const petIds = pets.map((p) => p._id.toString());

        if (petIds.length === 0) return res.send([]);

        const result = await adoptionCollection
          .find({ petId: { $in: petIds } })
          .sort({ timestamp: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch adoptions" });
      }
    });

    // PATCH: Update status of adoption request (accept/reject)
    app.patch("/adoptions/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body; // expect: "accepted" or "rejected"

      if (!["accepted", "rejected"].includes(status)) {
        return res.status(400).send({ error: "Invalid status" });
      }

      const result = await adoptionCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // 💝 DONATION CAMPAIGN ROUTES
    app.post("/donations-campaigns", async (req, res) => {
      const result = await donationCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/donation-user-campaigns", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.user.email !== email) {
        return res.status(403).send({ error: "Forbidden: Email mismatch" });
      }

      try {
        const campaigns = await donationCollection
          .aggregate([
            { $match: { createdBy: email } },
            {
              $addFields: {
                _idStr: { $toString: "$_id" }, // Convert ObjectId to string
              },
            },
            {
              $lookup: {
                from: "donations-payments",
                localField: "_idStr",
                foreignField: "campaignId",
                as: "donations",
              },
            },
            {
              $addFields: {
                totalDonated: { $sum: "$donations.amount" },
              },
            },
            {
              $project: {
                donations: 0,
                _idStr: 0,
              },
            },
          ])
          .toArray();

        res.send(campaigns);
      } catch (error) {
        console.error("Error fetching user campaigns:", error);
        res.status(500).send({ error: "Failed to fetch campaigns" });
      }
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

    // app.get("/donations-campaigns/:id", async (req, res) => {
    //   const id = req.params.id;

    //   // ✅ Check if id is a valid ObjectId
    //   if (!ObjectId.isValid(id)) {
    //     return res.status(400).send({ error: "Invalid campaign ID" });
    //   }

    //   try {
    //     const result = await donationCollection.findOne({
    //       _id: new ObjectId(id),
    //     });

    //     if (!result) {
    //       return res.status(404).send({ message: "Campaign not found" });
    //     }

    //     res.send(result);
    //   } catch (error) {
    //     console.error("🔥 Error fetching donation campaign by ID:", error);
    //     res.status(500).send({ error: "Server error while fetching campaign" });
    //   }
    // });

    app.get("/donations-campaigns/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const campaign = await donationCollection
          .aggregate([
            { $match: { _id: new ObjectId(id) } },
            {
              $addFields: {
                _idStr: { $toString: "$_id" }, // ObjectId to string
              },
            },
            {
              $lookup: {
                from: "donations-payments",
                localField: "_idStr",
                foreignField: "campaignId",
                as: "donations",
              },
            },
            {
              $addFields: {
                currentDonationAmount: { $sum: "$donations.amount" },
              },
            },
            {
              $project: {
                donations: 0,
                _idStr: 0,
              },
            },
          ])
          .toArray();

        if (!campaign.length) {
          return res.status(404).send({ error: "Campaign not found" });
        }

        res.send(campaign[0]);
      } catch (error) {
        console.error("Error fetching campaign:", error);
        res.status(500).send({ error: "Failed to fetch campaign" });
      }
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

    app.get(
      "/donations-campaigns/:id/donators",
      verifyJWT,
      async (req, res) => {
        const campaignId = req.params.id;

        try {
          let query = { campaignId: campaignId };
          if (ObjectId.isValid(campaignId)) {
            query = {
              $or: [
                { campaignId: campaignId },
                { campaignId: new ObjectId(campaignId) },
              ],
            };
          }

          const donators = await paymentCollection
            .find(query)
            .project({ donatorEmail: 1, donatorName: 1, amount: 1, _id: 0 })
            .toArray();

          res.send(
            donators.map((d) => ({
              email: d.donatorEmail,
              name: d.donatorName,
              amount: d.amount,
            }))
          );
        } catch (error) {
          console.error("Error fetching donators:", error);
          res.status(500).send({ error: "Failed to fetch donators" });
        }
      }
    );

    app.delete("/donations-campaigns/:id", async (req, res) => {
      const result = await donationCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // GET recommended campaigns, excluding the current one
    app.get("/recommended-campaigns", async (req, res) => {
      try {
        const { excludeId } = req.query;

        const matchStage = { paused: false };

        // ✅ Proper ObjectId validation
        if (excludeId && ObjectId.isValid(excludeId)) {
          matchStage._id = { $ne: new ObjectId(excludeId) };
        }

        const result = await donationCollection
          .aggregate([
            { $match: matchStage },
            {
              $sort: {
                urgency: -1,
                currentDonationAmount: 1,
                createdAt: -1,
              },
            },
            { $limit: 3 },
          ])
          .toArray();

        res.json(result);
      } catch (error) {
        console.error("🔥 Recommended campaigns error:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch recommended campaigns" });
      }
    });

    app.get("/dashboard/user-adoption-stats", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      if (req.user.email !== email) {
        return res.status(403).send({ error: "Forbidden: Email mismatch" });
      }

      try {
        // adoption count by status
        const totalAdoptions = await adoptionCollection.countDocuments({
          email,
          status: "approved",
        });
        const pendingAdoptions = await adoptionCollection.countDocuments({
          email,
          status: "pending",
        });
        const rejectedAdoptions = await adoptionCollection.countDocuments({
          email,
          status: "rejected",
        });
        const SuccessAdoptions = await adoptionCollection.countDocuments({
          email,
          status: "success",
        });

        // optionally fetch detailed list
        // const adoptionList = await adoptionCollection.find({ email }).toArray();

        res.send({
          success: true,
          totalAdoptions,
          pendingAdoptions,
          rejectedAdoptions,
          SuccessAdoptions,
          // adoptionList,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch adoption stats" });
      }
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

    app.get("/donations-payments/user", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.user.email !== email) {
        return res.status(403).send({ error: "Unauthorized access" });
      }

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

    //dynamic dashboard for admin and user for conditional
    app.get("/dashboard-stats", verifyJWT, async (req, res) => {
      const email = req.query.email;

      const user = await userCollection.findOne({ email });
      if (!user) return res.status(403).send({ error: "Unauthorized user" });

      if (user.role === "admin") {
        const [totalUsers, totalPets, totalCampaigns, totalDonations] =
          await Promise.all([
            userCollection.estimatedDocumentCount(),
            petCollection.estimatedDocumentCount(),
            donationCollection.estimatedDocumentCount(),
            paymentCollection
              .aggregate([
                { $group: { _id: null, total: { $sum: "$amount" } } },
              ])
              .toArray(),
          ]);

        res.send({
          role: "admin",
          totalUsers,
          totalPets,
          totalCampaigns,
          totalDonationAmount: totalDonations[0]?.total || 0,
        });
      } else {
        const [myPets, myDonations, myCampaigns] = await Promise.all([
          petCollection.countDocuments({ email }),
          paymentCollection
            .aggregate([
              { $match: { donatorEmail: email } },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ])
            .toArray(),
          donationCollection.countDocuments({ createdBy: email }),
        ]);

        res.send({
          role: "user",
          myPets,
          myDonations: myDonations[0]?.total || 0,
          myCampaigns,
        });
      }
    });

    app.get("/dashboard/pets-by-category", async (req, res) => {
      const result = await petCollection
        .aggregate([
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              count: 1,
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    app.get(
      "/dashboard/adoption-summary",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await adoptionCollection
          .aggregate([
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        let summary = {
          pending: 0,
          accepted: 0,
          rejected: 0,
          total: 0,
        };

        result.forEach((item) => {
          summary[item._id] = item.count;
          summary.total += item.count;
        });

        res.send(summary);
      }
    );

    app.get(
      "/dashboard/user-donations-breakdown",
      verifyJWT,
      async (req, res) => {
        const email = req.query.email;

        const result = await paymentCollection
          .aggregate([
            { $match: { donatorEmail: email } },
            { $group: { _id: "$campaignTitle", total: { $sum: "$amount" } } },
            { $project: { _id: 0, campaign: "$_id", total: 1 } },
            { $sort: { total: -1 } },
          ])
          .toArray();

        res.send(result);
      }
    );

    app.get("/dashboard/user-donation-history", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      // JWT user check
      if (req.user.email !== email) {
        return res.status(403).send({ error: "Forbidden: Email mismatch" });
      }

      try {
        const donations = await paymentCollection
          .find({ donatorEmail: email })
          .project({
            _id: 0,
            campaignId: 1,
            campaignTitle: 1,
            campaignImageUrl: 1,
            amount: 1,
            createdAt: 1,
          })
          .sort({ createdAt: -1 }) // latest first
          .toArray();

        res.send(donations);
      } catch (error) {
        console.error("Error fetching donation history:", error);
        res.status(500).send({ error: "Failed to fetch donation history" });
      }
    });

    // ✅ MongoDB Ping
    // await client.db("admin").command({ ping: 1 });
    // console.log("✅ Connected to MongoDB!");
  } finally {
    // await client.close(); // Optional
  }
}
run().catch(console.dir);

// 🚀 Start Server
app.listen(port, () => {
  // console.log("PetAdoption listening on port", port);
});
