test('updateLength recalculates length', function (t) {
	var l = new LRU({
		max: 10,
		length: function (item, key) {
			return item.length;
		}
	});
	var a = {
		length: 1
	};
	var b = {
		length: 1
	};
	var c = {
		length: 1
	};
	l.set('a', a)
	l.set('b', b)
	l.set('c', c)
	t.equal(l.length, 3)
	t.equal(l.lengthCalculator(a, 'a'), 1)

	a.length = 2
	t.equal(l.lengthCalculator(a, 'a'), 2)
	t.equal(l.length, 3)

	l.updateLength('a')
	t.equal(l.length, 4)
	t.end()
})

test('updateLength drops items if resized beyond max', function (t) {

	t.test('without locking', function (t) {
		var l = new LRU({
			max: 3,
			length: function (item, key) {
				return item.length;
			}
		});
		var a = {
			length: 1
		};
		var b = {
			length: 1
		};
		var c = {
			length: 1
		};
		l.set('a', a)
		l.set('b', b)
		l.set('c', c)
		t.equal(l.itemCount, 3)

		a.length = 2
		t.equal(l.itemCount, 3)
		t.ok(l.peek('a'))

		l.updateLength('a')
		t.equal(l.itemCount, 2)
		t.notOk(l.get('a'))
		t.end()
	})

	t.test('respects lock', function (t) {
		var l = new LRU({
			max: 3,
			length: function (item, key) {
				return item.length;
			}
		});
		var a = {
			length: 1
		};
		var b = {
			length: 1
		};
		var c = {
			length: 1
		};
		l.set('a', a)
		l.set('b', b)
		l.set('c', c)
		t.equal(l.itemCount, 3)

		l.lock('a')
		a.length = 2
		t.equal(l.itemCount, 3)
		t.ok(l.peek('a'))

		l.updateLength('a')
		t.equal(l.itemCount, 2)
		t.ok(l.get('a'))
		t.notOk(l.get('b'))
		t.end()
	})
	t.end()
})

test('updateLength of non-existent item has no effect', function (t) {
	var l = new LRU({
		max: 2
	})
	l.set('foo', 1)
	l.set('bar', 2)
	l.updateLength('baz')
	t.same(l.dumpLru().toArray().map(function (hit) {
		return hit.key
	}), ['bar', 'foo'])
	t.end()
})