// Copyright (c) Autodesk, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

module.exports = function (service) {
	const fs = require('fs');

	service = service || {};

	service.asIs = {};
	service.defaultNullOrEmptyString = {
		type: 'string',
		default: [null, '']
	};
	// service.defaultNullOrEmptyInt = {
	// 	type: 'integer',
	// 	default: [null, 0]
	// };
	// service.defaultNullOrEmptyFloat = {
	// 	type: 'float',
	// 	default: [null, 0.0]
	// };
	service.defaultNullOrEmptyDate = {
		type: 'date',
		default: [null, '']
	};
	service.defaultNullOrEmptyBoolean = {
		type: 'bool',
		default: [null, false]
	};

	service.copyArg = function (src, arg, out, outArg, isObject) {
		outArg = (typeof outArg !== 'undefined') ? outArg : arg; // map property
		var tmpValue = src[arg];
		if (typeof tmpValue !== 'undefined') {
			if (isObject && typeof tmpValue === 'string' && tmpValue !== '')
				tmpValue = JSON.parse(stmpValue);
			out[outArg] = tmpValue;
		} else if (src.payload && src.payload.hasOwnProperty(arg) && typeof src.payload[arg] !== 'undefined') {
			tmpValue = src.payload[arg];
			if (isObject && typeof tmpValue === 'string' && tmpValue !== '')
				tmpValue = JSON.parse(stmpValue);
			out[outArg] = tmpValue;
		} else if (src.topic === arg) {
			tmpValue = src.payload;
			if (isObject && typeof tmpValue === 'string' && tmpValue !== '')
				tmpValue = JSON.parse(stmpValue);
			out[outArg] = tmpValue;
		}
	};

	service.getParamsSimple = function (node, msg, keys, out) {
		var params = {};
		for (var i = 0; i < keys.length; i++) {
			service.copyArg(node, keys[i], params, undefined, false);
			service.copyArg(msg, keys[i], params, undefined, false);
		}
	};

	service.getParams = function (node, msg, params, out) {
		out = out || {};
		var keys = Object.keys(params);
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i];
			service.copyArg(node, key, out, undefined, false);
			service.copyArg(msg, key, out, undefined, false);

			if (params[key].type && params[key].type !== typeof out[key]) {
				switch (params[key].type) {
					case 'number':
						out[key] = parseFloat(out[key]);
						break;
					default:
						break;
				}
			}

			if (params[key].default && params[key].default.includes(out[key])) {
				delete out[key];
				continue;
			}
			if (params[key].min && out[key] < params[key].min) {
				out[key] = params[key].min;
				continue;
			}
			if (params[key].max && out[key] > params[key].max) {
				out[key] = params[key].max;
				continue;
			}

			if (params[key].type && params[key].type === 'date') {
				var dt = Date.parse(out[key]);
				out[key] = new Date(dt).toUTCString();
			}

			if (params[key].rename) { // Should be last
				out[params[key].rename] = out[key];
				delete out[key];
				continue;
			}
		}
	};

	service.filesize = function (filename, payload) {
		return (new Promise(function (fulfill, reject) {
			if (filename === '' && Buffer.isBuffer(payload))
				return (fulfill(payload.length));

			fs.stat(filename, function (err, stat) {
				if (err)
					reject(err);
				else
					fulfill(stat.size);
			});
		}));
	};

	// https://github.com/joliss/promise-map-series
	service.promiseSerie = function (array, iterator, thisArg) {
		var length = array.length;
		var current = Promise.resolve();
		var results = new Array(length);
		var cb = arguments.length > 2 ? iterator.bind(thisArg) : iterator;
		for (var i = 0; i < length; i++) {
			current = results[i] = current.then(function (i) { // jshint ignore:line
				return (cb(array[i], i, array));
			}.bind(undefined, i));
		}
		return (Promise.all(results));
	};

	service.safeBase64decode = function (base64) {
		// Add removed at end '='
		base64 += Array(5 - base64.length % 4).join('=');
		base64 = base64
			.replace(/\-/g, '+') // Convert '-' to '+'
			.replace(/\_/g, '/'); // Convert '_' to '/'
		return (new Buffer(base64, 'base64').toString());
	};

	service.safeBase64encode = function (st) {
		return (Buffer.from(st).toString('base64')
			.replace(/\+/g, '-') // Convert '+' to '-'
			.replace(/\//g, '_') // Convert '/' to '_'
			.replace(/=+$/, '')
		);
	};

	service.formatResponseOldSDK = function (response, raw) {
		if (raw) {
			if (response.hasOwnProperty('data')) {
				response.body = JSON.parse(JSON.stringify(response.data));
				delete response.data;
			}
		} else {
			if (response.hasOwnProperty('data'))
				response = JSON.parse(JSON.stringify(response.data));
			else if (response.hasOwnProperty('body'))
				response = JSON.parse(JSON.stringify(response.body));
		}
		return (response);
	};

	service.formatResponse = function (response, raw) {
		if (raw) {
			response.statusCode = response.response.statusCode;
			response.headers = response.response.headers;
			if (response.hasOwnProperty('data')) {
				response.body = JSON.parse(JSON.stringify(response.data));
				delete response.data;
			}
			delete response.response;
		} else {
			if (response.hasOwnProperty('data'))
				response = JSON.parse(JSON.stringify(response.data));
			else if (response.hasOwnProperty('body'))
				response = JSON.parse(JSON.stringify(response.body));
		}
		return (response);
	};

	service.formatErrorOldSDK = function (error) {
		console.error(error);
		return (error);
	};

	service.formatError = function (error) {
		console.error(error);
		if (error.response.statusCode)
			error.statusCode = error.response.statusCode;
		error.headers = error.response.headers;
		if (error.response.hasOwnProperty ('body'))
			error.details = JSON.parse(JSON.stringify(error.response.body));
		else
			error.details = error.response.text;
		delete error.response;
		return (error);
	};


};