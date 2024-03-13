import { ObjectId } from 'mongodb';
import { v4 as uuid4 } from 'uuid';
import { promises as fsPromises } from 'fs';
import path from 'path';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fs = require('fs');
const Bull = require('bull');

const fileQueue = new Bull('fileQueue');

class FilesController {
  static async postUpload(req, res) {
    // validate the token
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const key = `auth_${token}`;

    // Get the user
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('userId:', userId);
    const user = await dbClient.UsersCollection.findOne({ _id: ObjectId(userId) });

    // Extract necessary information from the request body
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;
    const fileTypes = ['folder', 'file', 'image'];

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !fileTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // check parentId
    if (parentId !== 0) {
      console.log('parentId:', parentId);
      const parentFile = await dbClient.FilesCollection.findOne({ _id: ObjectId(parentId) });
      if (!parentFile) return res.status(400).send({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') {
        return res.status(400).send({ error: 'Parent is not a folder' });
      }
    }

    // if the file type is a folder
    if (type === 'folder') {
      // Create a new file document in DB
      const newFile = {
        userId: user._id,
        name,
        type,
        isPublic,
        parentId,
      };
      const result = await dbClient.FilesCollection.insertOne(newFile);

      return res.status(201).json({
        id: result.insertedId,
        ...newFile,
        isPublic,
      });
    }

    // Handle content if type is file or image
    // set the storing folder path
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

    // create the storing folder if not existent
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // generate name of the file
    const fileName = uuid4();

    // decode data, create local filepath and store the file
    const filePath = path.join(folderPath, fileName);
    const fileData = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, fileData);

    // Save the file in the DB
    const newFile = {
      userId: user._id,
      name,
      type,
      isPublic,
      parentId,
      localPath: filePath,
    };

    // Add the new file document to the FilesCollection
    const result = await dbClient.FilesCollection.insertOne(newFile);

    // start a background processing for generating thumbnails for a file of type image
    if (type === 'image') {
      await fileQueue.add({
        userId: user._id,
        fileId: result.insertedId,
      });
    }

    // Return the new file with a status code 201
    return res.status(201).json({
      id: result.insertedId,
      ...newFile,
    });
  }

  static async getShow(req, res) {
    // console.log('getShow called');
    // validate the token
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const key = `auth_${token}`;

    // Get the userId
    const userId = await redisClient.get(key);
    // console.log(`userId=${userId}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // extract the request url id parameter
    const fileID = req.params.id;
    // console.log(`fileId=${fileID}`);

    // Check if the file document is linked to the user and the specified ID
    const file = await dbClient.FilesCollection.findOne({
      _id: ObjectId(fileID),
      userId: ObjectId(userId),
    });

    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json({ ...file });
  }

  static async getIndex(req, res) {
    // console.log('getIndex called');
    // validate the token
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const key = `auth_${token}`;

    // Get the user
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // console.log('userId:', userId);
    const user = await dbClient.UsersCollection.findOne({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // extract the querry parameters
    const parentId = req.query.parentId === '0' ? '0' : ObjectId(req.query.parentId);
    const page = parseInt(req.query.page || '0', 10); // Use page number from query, default to 0

    // Check if parentId is valid and exists in the database
    if (parentId !== '0') {
      const folder = await dbClient.FilesCollection.findOne({ _id: parentId });
      if (!folder || folder.type !== 'folder') {
        return res.status(200).json([]);
      }
    }

    // console.log(`parentId = ${parentId}`);
    let pipeline = [
      { $match: { parentId } },
      { $skip: page * 20 },
      { $limit: 20 },
    ];
    if (parentId === 0 || parentId === '0') {
      pipeline = [{ $skip: page * 20 }, { $limit: 20 }];
    }
    const fileCursor = await dbClient.FilesCollection.aggregate(pipeline);
    const fileList = [];
    await fileCursor.forEach((doc) => {
      const document = { id: doc._id, ...doc };
      delete document.localPath;
      delete document._id;
      fileList.push(document);
    });

    return res.status(200).json(fileList);
  }

  static async putPublish(req, res) {
    // validate the token
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const key = `auth_${token}`;

    // Get the user
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const query = {
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    };
    const file = await dbClient.FilesCollection.findOne(query);

    if (!file) return res.status(404).json({ error: 'Not found' });

    await dbClient.FilesCollection.updateOne(query, { $set: { isPublic: true } });

    file.id = file._id;
    file.isPublic = true;
    // delete file._id;
    // delete file.localPath;
    return res.status(200).json({
      ...file,
    });
  }

  static async putUnpublish(req, res) {
    // validate the token
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const key = `auth_${token}`;

    // Get the user
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const query = {
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    };
    const file = await dbClient.FilesCollection.findOne(query);

    if (!file) return res.status(404).json({ error: 'Not found' });

    await dbClient.FilesCollection.updateOne(query, { $set: { isPublic: false } });

    file.id = file._id;
    file.isPublic = false;
    // delete file._id;
    // delete file.localPath;
    return res.status(200).json({
      ...file,
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const { size } = req.query;
    const widths = ['500', '250', '100'];

    let query = {
      _id: ObjectId(fileId),
    };
    const fileExist = await dbClient.FilesCollection.findOne(query);
    if (!fileExist) return res.status(404).json({ error: 'Not found' });
    const {
      isPublic, type, name,
    } = fileExist;
    let { localPath } = fileExist;
    // check for x-token header
    const token = req.headers['x-token'];

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    query = {
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    };
    const owner = await dbClient.FilesCollection.findOne(query);

    if ((isPublic === false && !userId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if ((isPublic === false && !owner)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (type === 'folder') return res.status(400).json({ error: 'A folder doesn\'t have content' });

    const mimeType = mime.contentType(name);
    res.setHeader('Content-Type', mimeType);
    let data;
    try {
      if (size) localPath = `${localPath}_${size}`;
      if (size && !widths.includes(size)) return res.status(404).json({ error: 'Not found' });
      data = await fsPromises.readFile(localPath);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).send(data);
  }
}

module.exports = FilesController;
