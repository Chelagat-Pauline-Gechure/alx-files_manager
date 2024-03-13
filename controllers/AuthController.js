import { v4 as uuid4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const sha1 = require('sha1');

class AuthController {
  static async getConnect(req, res) {
    // check for basic auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // verify auth credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString();
    const [email, password] = credentials.split(':');

    if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

    // Get user from DB
    const shaPassword = sha1(password);
    const user = await dbClient.UsersCollection.findOne({
      email,
      password: shaPassword,
    });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Generate token 24 H
    const token = uuid4();
    const key = `auth_${token}`;
    await redisClient.set(key, user._id.toString(), 60 * 60 * 24);
    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const authToken = req.headers['x-token'];
    if (!authToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Retrieve user based on the token
    const key = `auth_${authToken}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Delete the token in Redis
    await redisClient.del(key);

    // Return nothing with a status code 204
    return res.status(204).send();
  }
}

module.exports = AuthController;
