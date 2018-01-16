test('unlocked items drop before locked items', function (t) {
	var l = new LRU({
		max: 2
	})
	l.set('a', 'A')
	l.set('b', 'B')
	l.lock('a')
	l.set('c', 'C')
	t.equal(l.get('a'), 'A')
	t.notOk(l.get('b'))
	t.end()
})

test('locked items drop if fully locked', function (t) {
	var l = new LRU({
		max: 2
	})
	l.set('a', 'A')
	l.set('b', 'B')
	l.lock('a')
	l.lock('b')
	l.max = 1
	t.notOk(l.get('a'))
	t.equal(l.get('b'), 'B')
	t.end()
})

test('locked items can be unlocked', function (t) {
	var l = new LRU({
		max: 2
	})
	l.set('a', 'A')
	l.set('b', 'B')
	l.lock('a')
	l.set('c', 'C')
	t.equal(l.peek('a'), 'A')
	l.unlock('a')
	l.set('d', 'D')
	t.notOk(l.get('a'))
	t.end()
})

test('locked items cannot be stale', function (t) {
	var l = new LRU({
		max: 10,
		maxAge: 50
	})
	l.set('a', 'A')
	l.lock('a')
	setTimeout(function () {
		t.equal(l.get('a'), 'A')
		t.end()
	}, 100)
})

test('cannot insert items if fully locked', function (t) {
	var l = new LRU({
		max: 3
	})
	l.set('a', 'A')
	l.set('b', 'B')
	l.set('c', 'C')
	l.lock('a')
	l.lock('b')
	l.lock('c')
	l.set('d', 'D')
	t.equal(l.get('a'), 'A')
	t.equal(l.get('b'), 'B')
	t.equal(l.get('c'), 'C')
	t.notOk(l.get('d'))
	t.end()
})

test('dump maintains lock', function (t) {
	var l = new LRU({
		max: 10,
		maxAge: 50
	})
	l.set('a', 'A')
	l.lock('a')
	var d = l.dump()
	l.reset()
	setTimeout(function () {
		l.load(d)
		t.equal(l.get('a'), 'A')
		t.end()
	}, 100)
})

test('del removes item even if locked', function (t) {
	var l = new LRU({
		max: 10
	})
	l.set('a', 'A')
	l.lock('a')
	l.del('a')
	t.notOk(l.get('a'))
	t.end()
})

test('reset removes item even if locked', function (t) {
	var l = new LRU({
		max: 10
	})
	l.set('a', 'A')
	l.lock('a')
	l.reset()
	t.notOk(l.get('a'))
	t.end()
})

test('set overwrites item even if locked', function (t) {
	var l = new LRU({
		max: 10
	})
	l.set('a', 'A')
	l.lock('a')
	l.set('a', 'B')
	t.equal(l.get('a'), 'B')
	t.end()
})

test('lock non-existent item has no effect', function (t) {
	var l = new LRU({
		max: 2
	})
	l.set('foo', 1)
	l.set('bar', 2)
	l.lock('baz')
	t.same(l.dumpLru().toArray().map(function (hit) {
		return hit.key
	}), ['bar', 'foo'])
	t.end()
})

test('unlock non-existent item has no effect', function (t) {
	var l = new LRU({
		max: 2
	})
	l.set('foo', 1)
	l.set('bar', 2)
	l.unlock('baz')
	t.same(l.dumpLru().toArray().map(function (hit) {
		return hit.key
	}), ['bar', 'foo'])
	t.end()
})