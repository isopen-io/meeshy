#!/usr/bin/env node

/**
 * Benchmark Script - Markdown Parser V2.2-OPTIMIZED
 *
 * Compares performance between:
 * - V1 (current production)
 * - V2.2-OPTIMIZED (new version)
 *
 * Run with: node scripts/benchmark-parser-v2.2.js
 */

const { performance } = require('perf_hooks');

// ============================================================================
// TEST DATA
// ============================================================================

const SIMPLE_MESSAGES = [
  'Hello world!',
  'This is a simple message.',
  'Another message here.',
  'Short text.',
  'Just a quick note.',
];

const MEDIUM_MESSAGES = [
  'Hello **world**! This is a *test* message.',
  'Check out this link: https://example.com',
  'Here is some `inline code` for you.',
  'This message has :smile: emojis :heart:',
  'A message with ~~strikethrough~~ text.',
];

const COMPLEX_MESSAGES = [
  `# Heading 1
## Heading 2

This is a **bold** and *italic* text with [link](https://example.com).

- Item 1
- Item 2
  - Nested item
- Item 3

\`\`\`javascript
const code = "test";
\`\`\`

> Blockquote text

---

:smile: :heart:`,

  `### Features

1. **Performance**: Very fast parsing
2. **Security**: XSS protection
3. **Cache**: LRU cache with TTL

| Feature | V1 | V2.2 |
|---------|----|----|
| Speed | Fast | Fast |
| Security | Basic | Advanced |

Check out m+ABC123 for tracking.`,

  `## Todo List

- [x] Complete task 1
- [ ] Pending task 2
- [ ] Pending task 3

**Important**: Don't forget to check https://example.com/docs

\`\`\`python
def hello():
    print("Hello World")
\`\`\`

> Note: This is a complex message with multiple elements.`,
];

// ============================================================================
// BENCHMARK FUNCTIONS
// ============================================================================

/**
 * Benchmark a parser with given messages
 */
function benchmarkParser(parserFn, messages, iterations = 100) {
  const times = [];

  // Warmup (5 iterations)
  for (let i = 0; i < 5; i++) {
    messages.forEach(msg => parserFn(msg));
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    messages.forEach(msg => parserFn(msg));
    const end = performance.now();
    times.push(end - start);
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  return { min, max, avg, p50, p95, p99, times };
}

/**
 * Benchmark a single message parse
 */
function benchmarkSingleMessage(parserFn, message, iterations = 1000) {
  const times = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    parserFn(message);
  }

  // Benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    parserFn(message);
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];

  return { avg, p95 };
}

/**
 * Benchmark cache performance
 */
function benchmarkCache(parserFn, message, iterations = 100) {
  const times = {
    first: [],
    cached: []
  };

  // First call (no cache)
  for (let i = 0; i < iterations; i++) {
    const uniqueMsg = message + i; // Ensure cache miss
    const start = performance.now();
    parserFn(uniqueMsg);
    const end = performance.now();
    times.first.push(end - start);
  }

  // Cached calls
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    parserFn(message); // Same message = cache hit
    const end = performance.now();
    times.cached.push(end - start);
  }

  const avgFirst = times.first.reduce((sum, t) => sum + t, 0) / times.first.length;
  const avgCached = times.cached.reduce((sum, t) => sum + t, 0) / times.cached.length;

  return { avgFirst, avgCached, speedup: avgFirst / avgCached };
}

/**
 * Format time with color
 */
function formatTime(ms, threshold) {
  const color = ms < threshold ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  return `${color}${ms.toFixed(2)}ms${reset}`;
}

/**
 * Print benchmark results
 */
function printResults(label, results, threshold) {
  console.log(`\n${label}:`);
  console.log(`  Min:  ${formatTime(results.min, threshold)}`);
  console.log(`  Max:  ${formatTime(results.max, threshold * 2)}`);
  console.log(`  Avg:  ${formatTime(results.avg, threshold)}`);
  console.log(`  P50:  ${formatTime(results.p50, threshold)}`);
  console.log(`  P95:  ${formatTime(results.p95, threshold * 1.5)}`);
  console.log(`  P99:  ${formatTime(results.p99, threshold * 2)}`);
}

/**
 * Print comparison
 */
function printComparison(v1Results, v2Results, label) {
  const speedup = v1Results.avg / v2Results.avg;
  const speedupColor = speedup >= 1 ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`\n${label} Comparison:`);
  console.log(`  V1 avg:   ${v1Results.avg.toFixed(2)}ms`);
  console.log(`  V2.2 avg: ${v2Results.avg.toFixed(2)}ms`);
  console.log(`  Speedup:  ${speedupColor}${speedup.toFixed(2)}x${reset}`);
}

// ============================================================================
// MOCK PARSERS (for demonstration - replace with actual imports)
// ============================================================================

/**
 * Mock V1 Parser (simulates V1 performance)
 */
function mockV1Parser(content) {
  // Simulate V1 parsing time (~2-8ms)
  const complexity = content.length / 100;
  const baseTime = 0.002; // 2ms base
  const variableTime = Math.random() * complexity * 0.001;
  const totalTime = baseTime + variableTime;

  // Simulate work
  const start = performance.now();
  while (performance.now() - start < totalTime) {
    // Busy wait to simulate parsing
  }

  return `<p>${content}</p>`;
}

/**
 * Mock V2.2 Parser (simulates V2.2 performance with cache)
 */
const mockV2Cache = new Map();
function mockV2Parser(content) {
  // Check cache
  if (mockV2Cache.has(content)) {
    return mockV2Cache.get(content);
  }

  // Simulate V2.2 parsing time (~3-12ms)
  const complexity = content.length / 100;
  const baseTime = 0.003; // 3ms base
  const variableTime = Math.random() * complexity * 0.001;
  const totalTime = baseTime + variableTime;

  // Simulate work
  const start = performance.now();
  while (performance.now() - start < totalTime) {
    // Busy wait
  }

  const html = `<p>${content}</p>`;

  // Cache result
  if (mockV2Cache.size < 100) {
    mockV2Cache.set(content, html);
  }

  return html;
}

// ============================================================================
// MAIN BENCHMARK
// ============================================================================

console.log('\n========================================');
console.log('Markdown Parser V2.2-OPTIMIZED Benchmark');
console.log('========================================\n');

console.log('Note: This is a mock benchmark.');
console.log('Replace mock parsers with actual imports for real results.\n');

// Test 1: Simple Messages
console.log('\n--- TEST 1: Simple Messages (5 messages, 100 iterations) ---');
const v1Simple = benchmarkParser(mockV1Parser, SIMPLE_MESSAGES);
const v2Simple = benchmarkParser(mockV2Parser, SIMPLE_MESSAGES);
printResults('V1 Results', v1Simple, 10);
printResults('V2.2 Results', v2Simple, 10);
printComparison(v1Simple, v2Simple, 'Simple Messages');

// Test 2: Medium Messages
console.log('\n--- TEST 2: Medium Messages (5 messages, 100 iterations) ---');
const v1Medium = benchmarkParser(mockV1Parser, MEDIUM_MESSAGES);
const v2Medium = benchmarkParser(mockV2Parser, MEDIUM_MESSAGES);
printResults('V1 Results', v1Medium, 15);
printResults('V2.2 Results', v2Medium, 15);
printComparison(v1Medium, v2Medium, 'Medium Messages');

// Test 3: Complex Messages
console.log('\n--- TEST 3: Complex Messages (3 messages, 100 iterations) ---');
const v1Complex = benchmarkParser(mockV1Parser, COMPLEX_MESSAGES);
const v2Complex = benchmarkParser(mockV2Parser, COMPLEX_MESSAGES);
printResults('V1 Results', v1Complex, 30);
printResults('V2.2 Results', v2Complex, 30);
printComparison(v1Complex, v2Complex, 'Complex Messages');

// Test 4: Single Message Performance
console.log('\n--- TEST 4: Single Message Performance (1000 iterations) ---');
const testMsg = 'Hello **world**! This is a *test*.';
const v1Single = benchmarkSingleMessage(mockV1Parser, testMsg);
const v2Single = benchmarkSingleMessage(mockV2Parser, testMsg);
console.log(`\nV1 Single Message:`);
console.log(`  Avg: ${formatTime(v1Single.avg, 5)}`);
console.log(`  P95: ${formatTime(v1Single.p95, 10)}`);
console.log(`\nV2.2 Single Message:`);
console.log(`  Avg: ${formatTime(v2Single.avg, 5)}`);
console.log(`  P95: ${formatTime(v2Single.p95, 10)}`);

// Test 5: Cache Performance
console.log('\n--- TEST 5: Cache Performance (100 iterations) ---');
const cacheResults = benchmarkCache(mockV2Parser, 'Cache test message');
console.log(`\nFirst call (no cache):  ${cacheResults.avgFirst.toFixed(2)}ms`);
console.log(`Cached call:            ${cacheResults.avgCached.toFixed(2)}ms`);
console.log(`Speedup:                ${cacheResults.speedup.toFixed(2)}x`);

// Test 6: Conversation Simulation (50 messages)
console.log('\n--- TEST 6: Conversation Simulation (50 messages) ---');
const conversation = [
  ...SIMPLE_MESSAGES,
  ...SIMPLE_MESSAGES,
  ...SIMPLE_MESSAGES,
  ...SIMPLE_MESSAGES,
  ...MEDIUM_MESSAGES,
  ...MEDIUM_MESSAGES,
  ...MEDIUM_MESSAGES,
  ...MEDIUM_MESSAGES,
  ...COMPLEX_MESSAGES,
  ...COMPLEX_MESSAGES,
];

const v1Conv = benchmarkParser(mockV1Parser, conversation, 10);
const v2Conv = benchmarkParser(mockV2Parser, conversation, 10);
printResults('V1 Conversation', v1Conv, 100);
printResults('V2.2 Conversation', v2Conv, 150);
printComparison(v1Conv, v2Conv, 'Conversation (50 messages)');

// Summary
console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================\n');

console.log('Performance Targets:');
console.log('  ✅ Simple message:  < 5ms');
console.log('  ✅ Medium message:  < 10ms');
console.log('  ✅ Complex message: < 15ms');
console.log('  ✅ 50 messages:     < 200ms');
console.log('  ✅ Cache speedup:   > 10x');

console.log('\nActual Results (V2.2):');
console.log(`  Simple avg:   ${v2Single.avg.toFixed(2)}ms ${v2Single.avg < 5 ? '✅' : '❌'}`);
console.log(`  Medium avg:   ${v2Medium.avg.toFixed(2)}ms ${v2Medium.avg < 10 ? '✅' : '❌'}`);
console.log(`  Complex avg:  ${v2Complex.avg.toFixed(2)}ms ${v2Complex.avg < 15 ? '✅' : '❌'}`);
console.log(`  50 messages:  ${v2Conv.avg.toFixed(2)}ms ${v2Conv.avg < 200 ? '✅' : '❌'}`);
console.log(`  Cache speedup: ${cacheResults.speedup.toFixed(2)}x ${cacheResults.speedup > 10 ? '✅' : '❌'}`);

console.log('\n========================================\n');

// Exit with success
process.exit(0);
