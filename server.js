
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.mongodb+srv://wishlistuser:<v9KMlosdVBH4GFCbe7Inz5o3lQCspPVd>@cluster0.xd17b0p.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Schemas
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    joinDate: Date
});

const postSchema = new mongoose.Schema({
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        content: String,
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: Date
    }],
    createdAt: Date
});

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    timestamp: Date
});

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Message = mongoose.model('Message', messageSchema);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    
    jwt.verify(token, process.env.v9KMlosdVBH4GFCbe7Inz5o3lQCspPVd, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
});
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = new User({
            name,
            email,
            password: hashedPassword,
            joinDate: new Date()
        });
        
        await user.save();
        
        const token = jwt.sign({ id: user._id }, 'your-secret-key', { expiresIn: '24h' });
        res.json({ user: { id: user._id, name, email, joinDate: user.joinDate }, token });
    } catch (error) {
        res.status(400).json({ message: 'Error registering user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user._id }, 'your-secret-key', { expiresIn: '24h' });
        res.json({ user: { id: user._id, name: user.name, email, joinDate: user.joinDate }, token });
    } catch (error) {
        res.status(400).json({ message: 'Error logging in' });
    }
});

// Post Routes
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('author', 'name')
            .sort({ createdAt: -1 });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching posts' });
    }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const post = new Post({
            content: req.body.content,
            author: req.user.id,
            createdAt: new Date(),
            likes: [],
            comments: []
        });
        
        await post.save();
        const populatedPost = await Post.findById(post._id).populate('author', 'name');
        io.emit('new-post', populatedPost);
        res.json(populatedPost);
    } catch (error) {
        res.status(500).json({ message: 'Error creating post' });
    }
});

app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post.likes.includes(req.user.id)) {
            post.likes.push(req.user.id);
            await post.save();
        }
        res.json(post);
    } catch (error) {
        res.status(500).json({ message: 'Error liking post' });
    }
});

app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        post.comments.push({
            content: req.body.content,
            author: req.user.id,
            createdAt: new Date()
        });
        await post.save();
        res.json(post);
    } catch (error) {
        res.status(500).json({ message: 'Error commenting on post' });
    }
});

// Socket.IO handling
io.on('connection', (socket) => {
    socket.on('user-connected', (userId) => {
        socket.join(userId);
    });

    socket.on('send-message', async (message) => {
        try {
            const newMessage = new Message({
                sender: message.sender,
                recipient: message.recipient,
                content: message.content,
                timestamp: new Date()
            });
            
            await newMessage.save();
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'name');
                
            io.to(message.recipient).emit('new-message', {
                ...populatedMessage.toObject(),
                senderName: populatedMessage.sender.name
            });
            io.to(message.sender).emit('new-message', {
                ...populatedMessage.toObject(),
                senderName: populatedMessage.sender.name
            });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    socket.on('user-disconnected', (userId) => {
        socket.leave(userId);
    });
});
app.use(express.static('public'));
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
