const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); 
require('dotenv').config({ path: '../.env' }); 


const app = express();

// Middleware setup
app.use(cors({
    origin: ['http://localhost:5173'], 
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
    const { name, email, photoUrl,password, role } = req.body;
    // console.log(req.body)
    try {
        console.log('Request body:', req.body);
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
            photoUrl,
            password: hashedPassword, 
            role
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
        // console.log(user)

        if (!user) {
            return res.status(400).send({ message: 'User not found' });
        }

        // Compare the entered password with the stored hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
 

        if (!isPasswordValid) {
            return res.status(400).send({ message: 'Invalid password' });
        }

        // Generate a JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role }, // Add role to token
            process.env.JWT_SECRET,
            { expiresIn: '6h' }
        );

        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.status(200).send({ message: 'Login successful', token, role: user.role });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

app.post('/api/dashboard/add-lesson', async (req, res) => {
    const { lessonName, lessonNumber } = req.body;

    try {

        const lessonCollection = client.db('japanese-db').collection('lessons');

        // Check for existing lesson
        const existingLesson = await lessonCollection.findOne({ lessonNumber });
        if (existingLesson) {
            return res.status(400).send({ message: 'Lesson Number already registered' });
        }

        // Insert new lesson
        const result = await lessonCollection.insertOne({
            lessonName,
            lessonNumber: Number(lessonNumber),
        });

        res.status(201).send({ success: true, result });
    } catch (error) {
        console.error('Error adding lesson:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});
app.post('/api/dashboard/add-vocabulary', async (req, res) => {
    const {  word, pronunciation, meaning, whenToSay, lessonNumber } = req.body;

    try {
        

        const lessonCollection = client.db('japanese-db').collection('vocabularies');

        // Insert new lesson
        const result = await lessonCollection.insertOne({
            word, pronunciation, meaning, whenToSay,
            lessonNumber: Number(lessonNumber), 
        });

        res.status(201).send({ success: true, result });
    } catch (error) {
        console.error('Error adding lesson:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Get all users
app.get('/api/dashboard/users', async (req, res) => {
    try {
        const userCollection = client.db('japanese-db').collection('users');
        const users = await userCollection.find().toArray();

        if (!users.length) {
            return res.status(404).send({ message: 'No users found' });
        }
       

        res.status(200).send(users); 
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

//UPDATE USER
app.patch('/api/admin/users/:userId/role', async (req, res) => {
    const { userId } = req.params;
    const { role: newRole } = req.body; 

    if (!newRole) {
        return res.status(400).send({ message: 'Role is required' });
    }

    try {
        const userCollection = client.db('japanese-db').collection('users');

        
        const result = await userCollection.updateOne(
            { _id: new ObjectId(userId) }, 
            { $set: { role: newRole } }   
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'User not found' });
        }

        if (result.modifiedCount === 0) {
            return res.status(304).send({ message: 'Role not modified' });
        }

        res.status(200).send({ message: 'Role updated successfully' });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// GET LESSONS and LESSONS vocabulary number for each lesson number
app.get('/api/dashboard/lessons', async (req, res) => {
    try {
        const db = client.db('japanese-db');
        const lessonCollection = db.collection('lessons');

        // Fetch raw lessons
        const rawLessons = await lessonCollection.find().toArray();

        // Fetch lessons with vocabulary counts
        const lessonsWithVocabularyCounts = await lessonCollection.aggregate([
            {
                $lookup: {
                    from: 'vocabularies', 
                    localField: 'lessonNumber', 
                    foreignField: 'lessonNumber', 
                    as: 'vocabularyData' 
                }
            },
            {
                $addFields: {
                    vocabularyCount: {
                        $size: '$vocabularyData' 
                    }
                }
            },
            {
                $project: {
                    _id: 0, 
                    lessonNumber: 1, 
                    name: 1, 
                    vocabularyCount: 1 
                }
            }
        ]).toArray();

        if (!rawLessons.length && !lessonsWithVocabularyCounts.length) {
            return res.status(404).send({ message: 'No lessons found' });
        }

        // Return both datasets
        res.status(200).send({
            rawLessons,
            lessonsWithVocabularyCounts
        });
    } catch (error) {
        console.error('Error fetching lessons:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});
//UPDATE Lesson
app.put('/api/lessons/update/:id', async (req, res) => {
    console.log(req.params, req.body);  

    try {
        const { id } = req.params;  
        const { lessonNumber, lessonName } = req.body;  

        if (!lessonNumber || !lessonName) {
            return res.status(400).send({ message: 'Lesson number and lesson name are required' });
        }

        const lessonCollection = client.db('japanese-db').collection('lessons');  
        
        const result = await lessonCollection.updateOne(
            { _id: new ObjectId(id) },  
            { $set: { lessonNumber, lessonName } }  
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'Lesson not found' });
        }

        res.status(200).send({ message: 'Lesson updated successfully' });
    } catch (error) {
        console.error('Error updating lesson:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// DELETE a lesson
app.delete('/api/lessons/delete/:id', async (req, res) => {
    console.log(req.params)
    try {
        const { id } = req.params;  
        const lessonCollection = client.db('japanese-db').collection('lessons');  
        
        const result = await lessonCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).send({ message: 'Lesson not found' });
        }

        res.status(200).send({ message: 'Lesson deleted successfully' });
    } catch (error) {
        console.error('Error deleting lesson:', error);
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