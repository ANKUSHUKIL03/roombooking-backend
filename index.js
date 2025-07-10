const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const imageDownLoader = require('image-downloader');
const Place = require('./models/Place.js');
const multer = require('multer');
const mongoose = require('mongoose');
const Booking = require('./models/Booking.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User.js');

const app = express();
const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = 'gabcgsjalhstbckass nchss';

// ✅ Middleware
app.use(cors({
  credentials: true,
  origin: 'http://localhost:5173',
}));
app.use(express.json());
app.use(cookieParser());

// ✅ Serve uploads folder
app.use('/uploads', express.static(__dirname + '/uploads'));

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

// ✅ Test route
app.post('/test', (req, res) => {
  console.log("Received POST request on /test");
  res.send("Success!");
});

// ✅ Helper to get user from token
function getUserDataFromReq(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, (err, userData) => {
      if (err) return reject(err);
      resolve(userData);
    });
  });
}

// ✅ Register
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt)
    });
    res.status(201).json(userDoc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userDoc = await User.findOne({ email });
  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({ email: userDoc.email, id: userDoc._id }, jwtSecret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token).json(userDoc);
      });
    } else {
      res.status(422).json('Incorrect password');
    }
  } else {
    res.status(404).json('User not found');
  }
});

// ✅ Profile
app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) return res.status(403).json('Invalid token');
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, _id });
    });
  } else {
    res.status(401).json('Unauthorized');
  }
});

// ✅ Logout
app.post('/logout', (req, res) => {
  res.cookie('token', '').json(true);
});

// ✅ Upload image by link
app.post('/upload-by-link', async (req, res) => {
  const { link } = req.body;
  try {
    const ext = path.extname(link).split('?')[0] || '.jpg';
    const newName = 'photo' + Date.now() + ext;
    const destination = path.join(__dirname, '/uploads/', newName);

    await imageDownLoader.image({
      url: link,
      dest: destination,
    });

    console.log('Saved image as:', newName);
    res.json(newName);
  } catch (err) {
    console.error('Image download error:', err);
    res.status(500).json({ error: 'Failed to download image' });
  }
});

// ✅ Upload from form
const photosMiddleware = multer({ dest: 'uploads' });
app.post('/upload', photosMiddleware.array('photos', 100), (req, res) => {
  const uploadedFiles = [];
  for (let i = 0; i < req.files.length; i++) {
    const { path: filePath, originalname } = req.files[i];
    const ext = originalname.split('.').pop();
    const newPath = filePath + '.' + ext;
    fs.renameSync(filePath, newPath);
    uploadedFiles.push(newPath.replace('uploads\\', ''));
  }
  res.json(uploadedFiles);
});

// ✅ Create new place
app.post('/places', (req, res) => {
  const { token } = req.cookies;
  const {
    title, address, addedPhotos, description, perks,
    extraInfo, checkIn, checkOut, maxGuests, prices
  } = req.body;

  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    try {
      const placeDoc = await Place.create({
        owner: userData.id,
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        prices
      });
      res.json(placeDoc);
    } catch (err) {
      console.error("Error creating place:", err);
      res.status(500).json({ error: "Failed to create place" });
    }
  });
});

// ✅ Get places owned by current user
app.get('/user-places', (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err || !userData?.id) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const places = await Place.find({ owner: userData.id });
      res.json(places);
    } catch (dbErr) {
      console.error("DB error in /user-places:", dbErr);
      res.status(500).json({ error: 'Database error' });
    }
  });
});

// ✅ Get place by ID
app.get('/places/:id', async (req, res) => {
  const { id } = req.params;
  const place = await Place.findById(id);
  if (!place) return res.status(404).send('Not found');
  res.json(place);
});

// ✅ Update place
app.put('/places', async (req, res) => {
  const {
    id, title, address, addedPhotos, description, perks,
    extraInfo, checkIn, checkOut, maxGuests, price
  } = req.body;
  const { token } = req.cookies;

  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    const placeDoc = await Place.findById(id);
    if (userData.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price
      });
      await placeDoc.save();
      res.json('ok');
    } else {
      res.status(403).json({ error: 'Unauthorized' });
    }
  });
});

// ✅ Get all places (public)
app.get('/places', async (req, res) => {
  res.json(await Place.find());
});

// ✅ Get bookings of logged-in user
app.get('/bookings', async (req, res) => {
  try {
    const userData = await getUserDataFromReq(req);
    const bookings = await Booking.find({ user: userData.id }).populate('place');
    res.json(bookings);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(401).json({ error: "Unauthorized" });
  }
});

// ✅ Create new booking
app.post('/bookings', async (req, res) => {
  try {
    const userData = await getUserDataFromReq(req);
    const { place, checkIn, checkOut, numberOfGuests, name, phone, price } = req.body;

    const bookingDoc = await Booking.create({
      place,
      checkIn,
      checkOut,
      numberOfGuests,
      name,
      phone,
      price,
      user: userData.id
    });

    res.json(bookingDoc);
  } catch (err) {
    console.error("Booking creation error:", err.message);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// ✅ Start server
app.listen(4000, () => {
  console.log("Server is running on http://localhost:4000");
});
