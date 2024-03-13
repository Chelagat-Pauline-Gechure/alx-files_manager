import { promisify } from 'util';
import { createClient } from 'redis';

const { createClient } = require('redis');
const { promisify } = require('util');

/**
 * Represent Redis client.
 */
class RedisClient {
	/**
	 * Create a new redisClient instance.
	 */
	constructor() {
		this.client = createClient();
		this.client.on('error', (err) => console.log(err));
		this.isClientConnected = false;
		this.client.on('connect', () => {
			this.isClientConnected = true;
		});
	}

	isAlive() {
		return this.isClientConnected;
	}

	async get(key) {
		return promisify(this.client.GET).bind(this.client)(key);
	}

	async set(key, value, duration) {
		const setAsync = promisify(this.client.set).bind(this.client);
		await setAsync(key, val, 'EX', dur);
	}

	async del(key) {
		await promisify(this.client.DEL).bind(this.client)(key);
	}
}

export const redisClient = new RedisClient();
export default redisClient;
