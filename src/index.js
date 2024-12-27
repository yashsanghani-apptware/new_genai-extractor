import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import route from './routes/routes.js';

dotenv.config();

const app = express();
// eslint-disable-next-line no-undef
const PORT = process.env.PORT || 3009;

// eslint-disable-next-line no-undef
const baseUrl = `http://${process.env.EXTRACTOR_HOST}:${process.env.EXTRACTOR_PORT}/`;
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors('*'));

// Routes
app.get("/", (req, res) => {
    res.json({ msg: 'This is Web Scraping Project' });
});

app.use('/api/v1',route);

// Start the server
app.listen(PORT, () => {
    console.log("Servier running on PORT ===>", PORT);
    console.log(`Server is running on ${baseUrl}`);
});
