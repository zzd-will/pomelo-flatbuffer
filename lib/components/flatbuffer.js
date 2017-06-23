
const SERVER = 'server';
const CLIENT = 'client';
const SERVERFB = 'serverFB';
const CLIENTFB = 'clientFB';
const FlatBufferIndex = require('../index');
const fs = require('fs');
const path = require('path');
const watchers = Symbol('watchers');
const serverFlatBuffer = Symbol('serverFlatBuffer');
const cliteFlatBuffer = Symbol('serverFlatBuffer');
const logger = require('pomelo-logger').getLogger('pomelo', __filename);

class FlatBuffer
{
	constructor(app, opts)
	{
		this.app = app;
		this.version = 0;
		this[watchers] = {};
		this[serverFlatBuffer] = {};
		this[cliteFlatBuffer] = {};
		this.serverFBCheck = {};
		this.clientFBCheck = {};
		opts = opts || {};
		this.serverProtosPath = opts.serverProtos || '/config/serverProtos.json';
		this.clientProtosPath = opts.clientProtos || '/config/clientProtos.json';
		this.serverFBPath = opts.serverFBPath || '/config/serverBFBS';
		this.clientFBPath = opts.clientFBPath || '/config/clientBFBS';
	}

	start(cb)
	{
		this.setProtos(SERVER, path.join(this.app.getBase(), this.serverProtosPath));
		this.setProtos(SERVER, path.join(this.app.getBase(), this.clientProtosPath));
		this.setProtos(SERVERFB, path.join(this.app.getBase(), this.serverFBPath));
		this.setProtos(CLIENTFB, path.join(this.app.getBase(), this.clientFBPath));
		process.nextTick(cb);
	}

	check(type, route)
	{

	}

	encode(route, message)
	{
		if (this.serverFBCheck[route])
		{
			route = this.serverFBCheck[route];
		}
		const flatInstance = this[serverFlatBuffer][route];
		if (flatInstance != null)
		{
			return flatInstance.generate(message);
		}
		return null;
	}

	decode(route, message)
	{
		if (this.clientFBCheck[route])
		{
			route = this.clientFBCheck[route];
		}
		const flatInstance = this[cliteFlatBuffer][route];
		if (flatInstance != null)
		{
			return flatInstance.parse(message);
		}
		return null;
	}

	getProtos()
	{
		return {
			server  : this.serverProtos,
			client  : this.clientProtos,
			version : this.version
		};
	}

	getVersion()
	{
		return this.version;
	}

	setProtos(type, filePath)
	{
		if (!fs.existsSync(filePath))
		{
			return;
		}

		const stats = fs.statSync(filePath);
		if (stats.isFile())
		{
			const baseName = path.basename(filePath);
			if (type === SERVER)
			{
				this.serverProtos = require(filePath);
			}
			else if (type === CLIENT)
			{
				this.clientProtos = require(filePath);
			}
			else
			{
				this.setFlatBufferData(type, filePath);
			}

			// Set version to modify time
			const time = stats.mtime.getTime();
			if (this.version < time)
			{
				this.version = time;
			}

			// Watch file
			const watcher = fs.watch(filePath, this.onUpdate.bind(this, type, filePath));
			if (this[watchers][baseName])
			{
				this[watchers][baseName].close();
			}
			this[watchers][baseName] = watcher;
		}
		else if (stats.isDirectory())
		{
			const files = fs.readdirSync(filePath);
			files.forEach((val, index) =>
			{
				const fPath = path.join(filePath, val);
				const stats = fs.statSync(fPath);
				if (stats.isFile()) this.setProtos(type, fPath);
			});
		}

	}

	onUpdate(type, filePath, event)
	{
		if (event !== 'change')
		{
			return;
		}
		try
		{
			if (type === SERVER || type === CLIENT)
			{
				const data = fs.readFileSync(filePath, 'utf8');
				if (type === SERVER)
				{
					this.serverProtos = JSON.parse(data);
				}
				else if (type === CLIENT)
				{
					this.clientProtos = JSON.parse(data);
				}
			}
			else
			{
				this.setFlatBufferData(type, filePath);
			}
			this.version = fs.statSync(path).mtime.getTime();
			logger.debug('change proto file , type : %j, path : %j, version : %j', type, path, this.version);
		}
		catch (err)
		{
			 logger.warn('change proto file error! path : %j', path);
			 logger.warn(err);
		}
	}

	setFlatBufferData(type, filePath)
	{
		const extName = path.extname(filePath);
		const baseName = path.basename(filePath, extName);
		const data = fs.readFileSync(filePath);
		if (extName === '.json')
		{
			if (type === SERVERFB)
			{
				this.serverFBCheck = JSON.parse(data);
			}
			else if (type === CLIENTFB)
			{
				this.clientFBCheck = JSON.parse(data);
			}
		}
		else
		{
			const flatBuild = FlatBufferIndex.compileSchema(data);
			if (type === SERVERFB)
			{
				this[serverFlatBuffer][baseName] = flatBuild;
			}
			else if (type === CLIENTFB)
			{
				this[cliteFlatBuffer][baseName] = flatBuild;
			}
		}
	}

	stop(force, cb)
	{
		for (const type in this[watchers])
		{
			const watcherTypes = this[watchers][type];
			for (const watcher in watcherTypes)
			{
				watcherTypes[watcher].close();
			}
		}
		this.watchers = {};
		process.nextTick(cb);
	}
}

module.exports = function(app, opts)
{
	return new FlatBuffer(app, opts);
};
FlatBuffer.prototype.name = '__decodeIO__protobuf__';