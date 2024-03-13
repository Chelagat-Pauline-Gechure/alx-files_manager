import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const sha1 = require('sha1');
const Bull = require('bull');

const userQueue = new Bull('userQueue');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) return res.status(400).send({ error: 'Missing email' });
    if (!password) return res.status(400).send({ error: 'Missing password' });

    if (await dbClient.UsersCollection.findOne({ email })) {
      return res.status(400).send({ error: 'Already exist' });
    }
    const hashPass = sha1(password);

    const newUser = {
      email,
      password: hashPass,
    };

    const result = await dbClient.UsersCollection.insertOne(newUser);

    // Add a job to the queue with userId
    await userQueue.add({
      userId: result.insertedId,
    });

    return res.status(201).json({ id: result.insertedId, email });
  }

  static async getMe(req, res) {
    const authToken = req.headers['x-token'];
    console.log(`authToken = ${authToken}`);
    if (!authToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Retrieve user based on the token
    const key = `auth_${authToken}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Retrieve user from the database
    const user = await dbClient.UsersCollection.findOne({ _id: ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Return the user object (email and id only)
    return res.status(200).json({ id: user._id, email: user.email });
  }
}

module.exports = UsersController;
