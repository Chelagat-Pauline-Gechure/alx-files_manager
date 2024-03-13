import express from 'express';
import routing from './routes/index';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
routing(app);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

module.exports = app;
