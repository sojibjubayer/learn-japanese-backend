const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Added bcrypt for password hashing
require('dotenv').config({ path: '../.env' }); // Load from parent directory

const app = express();

// Middleware setup
app.use(cors({
    origin: ['http://localhost:5173'], // List your allowed frontend origins
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.j998cjx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Function to ensure MongoDB connection
async function run() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}
run();

// Register route
app.post('/api/register', async (req, res) => {
    const { name, email, password, photoUrl } = req.body;
    
    try {
        const userCollection = client.db('japanese-db').collection('users');
        
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ message: 'User already registered' });
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await userCollection.insertOne({
            name, 
            email,
            password: hashedPassword, // Store the hashed password
            photoUrl
        });

        res.status(201).send(result);
    } catch (error) {
        console.error('Error inserting user:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Login route
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userCollection = client.db('japanese-db').collection('users');
        const user = await userCollection.findOne({ email });

        if (!user) {
            return res.status(400).send({ message: 'User not found' });
        }

        // Compare the entered password with the stored hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).send({ message: 'Invalid password' });
        }

        // Generate a JWT token
        const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: '12h' });

        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.status(200).send({ message: 'Login successful', token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Root route
app.get('/', (req, res) => {
    res.send('Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
