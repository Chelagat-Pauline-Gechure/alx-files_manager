import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    const uri = `mongodb://${host}:${port}/${database}`;

    // create a MongoDB client
    this.client = new MongoClient(uri, { useUnifiedTopology: true });

    // Initialize connection status
    this.connectionStatus = false;

    // Connect to MongoDB
    this.client.connect((err) => {
      if (err) console.log(err);
      else {
        this.connectionStatus = true;
        this.db = this.client.db();
        this.UsersCollection = this.db.collection('users');
        this.FilesCollection = this.db.collection('files');
      }
    });
  }

  isAlive() {
    return this.connectionStatus;
  }

  async nbUsers() {
    try {
      const count = await this.UsersCollection.countDocuments();
      console.log(`Number of Users: ${count}`);
      return count;
    } catch (error) {
      console.error(`Error in nbUsers: ${error}`);
      throw error;
    }
  }

  async nbFiles() {
    try {
      const count = await this.FilesCollection.countDocuments();
      console.log(`Number of Files: ${count}`);
      return count;
    } catch (error) {
      console.error(`Error in nbFiles: ${error}`);
      throw error;
    }
  }
}

const dbClient = new DBClient();
export default dbClient;
