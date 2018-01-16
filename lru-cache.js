// original license:
// 
// The ISC License
// Copyright (c) Isaac Z. Schlueter and Contributors
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
// IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

window.LRUCache = (function () {
	'use strict';

	// use symbols if possible, otherwise just _props
	var hasSymbol = typeof Symbol === 'function';
	var makeSymbol;
	if (hasSymbol) {
		makeSymbol = function (key) {
			return Symbol.for(key);
		};
	} else {
		makeSymbol = function (key) {
			return '_' + key;
		};
	}

	var MAX = makeSymbol('max');
	var LENGTH = makeSymbol('length');
	var LENGTH_CALCULATOR = makeSymbol('lengthCalculator');
	var ALLOW_STALE = makeSymbol('allowStale');
	var MAX_AGE = makeSymbol('maxAge');
	var DISPOSE = makeSymbol('dispose');
	var NO_DISPOSE_ON_SET = makeSymbol('noDisposeOnSet');
	var LRU_LIST = makeSymbol('lruList');
	var CACHE = makeSymbol('cache');

	function naiveLength() {
		return 1;
	}

	// lruList is a yallist where the head is the youngest
	// item, and the tail is the oldest.  the list contains the Hit
	// objects as the entries.
	// Each Hit object has a reference to its Yallist.Node.  This
	// never changes.
	//
	// cache is a Map (or PseudoMap) that matches the keys to
	// the Yallist.Node object.
	function LRUCache(options) {
		if (!(this instanceof LRUCache)) {
			return new LRUCache(options);
		}

		if (typeof options === 'number') {
			options = {
				max: options
			};
		}

		if (!options) {
			options = {};
		}

		var max = this[MAX] = options.max;
		// Kind of weird to have a default max of Infinity, but oh well.
		if (!max || typeof max !== 'number' || max <= 0) {
			this[MAX] = Infinity;
		}

		var lc = options.length || naiveLength;
		if (typeof lc !== 'function') {
			lc = naiveLength;
		}
		this[LENGTH_CALCULATOR] = lc;

		this[ALLOW_STALE] = options.stale || false;
		this[MAX_AGE] = options.maxAge || 0;
		this[DISPOSE] = options.dispose;
		this[NO_DISPOSE_ON_SET] = options.noDisposeOnSet || false;
		this.reset();
	}

	// resize the cache when the max changes.
	Object.defineProperty(LRUCache.prototype, 'max', {
		set: function (mL) {
			if (!mL || typeof mL !== 'number' || mL <= 0) {
				mL = Infinity;
			}
			this[MAX] = mL;
			trim(this);
		},
		get: function () {
			return this[MAX];
		},
		enumerable: true
	});

	Object.defineProperty(LRUCache.prototype, 'allowStale', {
		set: function (allowStale) {
			this[ALLOW_STALE] = !!allowStale;
		},
		get: function () {
			return this[ALLOW_STALE];
		},
		enumerable: true
	});

	Object.defineProperty(LRUCache.prototype, 'maxAge', {
		set: function (mA) {
			if (!mA || typeof mA !== 'number' || mA < 0) {
				mA = 0;
			}
			this[MAX_AGE] = mA;
			trim(this);
		},
		get: function () {
			return this[MAX_AGE];
		},
		enumerable: true
	});

	// resize the cache when the lengthCalculator changes.
	Object.defineProperty(LRUCache.prototype, 'lengthCalculator', {
		set: function (lC) {
			if (typeof lC !== 'function') {
				lC = naiveLength;
			}
			if (lC !== this[LENGTH_CALCULATOR]) {
				this[LENGTH_CALCULATOR] = lC;
				this[LENGTH] = 0;
				this[LRU_LIST].forEach(function (hit) {
					hit.length = this[LENGTH_CALCULATOR](hit.value, hit.key);
					this[LENGTH] += hit.length;
				}, this);
			}
			trim(this);
		},
		get: function () {
			return this[LENGTH_CALCULATOR];
		},
		enumerable: true
	});

	Object.defineProperty(LRUCache.prototype, 'length', {
		get: function () {
			return this[LENGTH];
		},
		enumerable: true
	});

	Object.defineProperty(LRUCache.prototype, 'itemCount', {
		get: function () {
			return this[LRU_LIST].length;
		},
		enumerable: true
	});

	LRUCache.prototype.rforEach = function (fn, thisp) {
		thisp = thisp || this;
		for (var walker = this[LRU_LIST].tail; walker !== null;) {
			var prev = walker.prev;
			forEachStep(this, fn, walker, thisp);
			walker = prev;
		}
	};

	function forEachStep(self, fn, node, thisp) {
		var hit = node.value;
		if (isStale(self, hit)) {
			del(self, node);
			if (!self[ALLOW_STALE]) {
				hit = undefined;
			}
		}
		if (hit) {
			fn.call(thisp, hit.value, hit.key, self);
		}
	}

	LRUCache.prototype.forEach = function (fn, thisp) {
		thisp = thisp || this;
		for (var walker = this[LRU_LIST].head; walker !== null;) {
			var next = walker.next;
			forEachStep(this, fn, walker, thisp);
			walker = next;
		}
	};

	LRUCache.prototype.keys = function () {
		return this[LRU_LIST].toArray().map(function (k) {
			return k.key;
		}, this);
	};

	LRUCache.prototype.values = function () {
		return this[LRU_LIST].toArray().map(function (k) {
			return k.value;
		}, this);
	};

	LRUCache.prototype.reset = function () {
		if (this[DISPOSE] &&
			this[LRU_LIST] &&
			this[LRU_LIST].length) {
			this[LRU_LIST].forEach(function (hit) {
				this[DISPOSE](hit.key, hit.value);
			}, this);
		}

		this[CACHE] = new Map(); // hash of items by key
		this[LRU_LIST] = new Yallist(); // list of items in order of use recency
		this[LENGTH] = 0; // length of items in the list
	};

	LRUCache.prototype.dump = function () {
		return this[LRU_LIST].map(function (hit) {
			if (!isStale(this, hit)) {
				return {
					k: hit.key,
					v: hit.value,
					e: hit.now + (hit.maxAge || 0)
				};
			}
		}, this).toArray().filter(function (h) {
			return h;
		});
	};

	LRUCache.prototype.dumpLru = function () {
		return this[LRU_LIST];
	};

	LRUCache.prototype.set = function (key, value, maxAge) {
		maxAge = maxAge || this[MAX_AGE];

		var now = maxAge ? Date.now() : 0;
		var len = this[LENGTH_CALCULATOR](value, key);

		if (this[CACHE].has(key)) {
			if (len > this[MAX]) {
				del(this, this[CACHE].get(key));
				return false;
			}

			var node = this[CACHE].get(key);
			var item = node.value;

			// dispose of the old one before overwriting
			// split out into 2 ifs for better coverage tracking
			if (this[DISPOSE]) {
				if (!this[NO_DISPOSE_ON_SET]) {
					this[DISPOSE](key, item.value);
				}
			}

			item.now = now;
			item.maxAge = maxAge;
			item.value = value;
			this[LENGTH] += len - item.length;
			item.length = len;
			this.get(key);
			trim(this);
			return true;
		}

		var hit = new Entry(key, value, len, now, maxAge);

		// oversized objects fall out of cache automatically.
		if (hit.length > this[MAX]) {
			if (this[DISPOSE]) {
				this[DISPOSE](key, value);
			}
			return false;
		}

		this[LENGTH] += hit.length;
		this[LRU_LIST].unshift(hit);
		this[CACHE].set(key, this[LRU_LIST].head);
		trim(this);
		return true;
	};

	LRUCache.prototype.updateLength = function (key) {
		var value;
		var node = this[CACHE].get(key);
		if (!node) {
			return;
		}
		value = node.value;
		var oldLength = value.length;
		value.length = this[LENGTH_CALCULATOR](value.value, key);
		this[LENGTH] += value.length - oldLength;
		trim(this);
	};

	LRUCache.prototype.has = function (key) {
		if (!this[CACHE].has(key)) {
			return false;
		}
		var hit = this[CACHE].get(key).value;
		if (isStale(this, hit)) {
			return false;
		}
		return true;
	};

	LRUCache.prototype.get = function (key) {
		return get(this, key, true);
	};

	LRUCache.prototype.peek = function (key) {
		return get(this, key, false);
	};

	LRUCache.prototype.pop = function () {
		var node = this[LRU_LIST].tail;
		if (!node) {
			return null;
		}
		del(this, node);
		return node.value;
	};

	LRUCache.prototype.del = function (key) {
		del(this, this[CACHE].get(key));
	};

	LRUCache.prototype.load = function (arr) {
		// reset the cache
		this.reset();

		var now = Date.now();
		// A previous serialized cache has the most recent items first
		for (var l = arr.length - 1; l >= 0; l--) {
			var hit = arr[l];
			var expiresAt = hit.e || 0;
			if (expiresAt === 0) {
				// the item was created without expiration in a non aged cache
				this.set(hit.k, hit.v);
			} else {
				var maxAge = expiresAt - now;
				// dont add already expired items
				if (maxAge > 0) {
					this.set(hit.k, hit.v, maxAge);
				}
			}
		}
	};

	LRUCache.prototype.prune = function () {
		var self = this;
		this[CACHE].forEach(function (value, key) {
			get(self, key, false);
		});
	};

	LRUCache.prototype.lock = function (key) {
		var node = this[CACHE].get(key);
		if (!node) {
			return;
		}
		node.value.locked = true;
	};

	LRUCache.prototype.unlock = function (key) {
		var node = this[CACHE].get(key);
		if (!node) {
			return;
		}
		node.value.locked = false;
	};

	function get(self, key, doUse) {
		var hit;
		var node = self[CACHE].get(key);
		if (node) {
			hit = node.value;
			if (isStale(self, hit)) {
				del(self, node);
				if (!self[ALLOW_STALE]) {
					hit = undefined;
				}
			} else {
				if (doUse) {
					self[LRU_LIST].unshiftNode(node);
				}
			}
			if (hit) {
				hit = hit.value;
			}
		}
		return hit;
	}

	function isStale(self, hit) {
		if (!hit || hit.locked || (!hit.maxAge && !self[MAX_AGE])) {
			return false;
		}
		var stale = false;
		var diff = Date.now() - hit.now;
		if (hit.maxAge) {
			stale = diff > hit.maxAge;
		} else {
			stale = self[MAX_AGE] && (diff > self[MAX_AGE]);
		}
		return stale;
	}

	function trim(self) {
		var walker;
		// return early if not overflowed
		if (self[LENGTH] <= self[MAX]) {
			return;
		}
		// start trim with unlocked
		walker = self[LRU_LIST].tail;
		while (self[LENGTH] > self[MAX] && walker !== null) {
			// We know that we're about to delete this one, and also
			// what the next least recently used key will be, so just
			// go ahead and set it now.
			var prev = walker.prev;
			if (!walker.value.locked) {
				del(self, walker);
			}
			walker = prev;
		}
		// return early if not overflowed
		if (self[LENGTH] <= self[MAX]) {
			return;
		}
		// trim locked if still needed
		walker = self[LRU_LIST].tail;
		while (self[LENGTH] > self[MAX] && walker !== null) {
			var prev = walker.prev;
			del(self, walker);
			walker = prev;
		}
	}

	function del(self, node) {
		if (node) {
			var hit = node.value;
			if (self[DISPOSE]) {
				self[DISPOSE](hit.key, hit.value);
			}
			self[LENGTH] -= hit.length;
			self[CACHE].delete(hit.key);
			self[LRU_LIST].removeNode(node);
		}
	}

	// classy, since V8 prefers predictable objects.
	function Entry(key, value, length, now, maxAge) {
		this.key = key;
		this.value = value;
		this.length = length;
		this.now = now;
		this.maxAge = maxAge || 0;
		this.locked = false;
	}

	return LRUCache;
}());