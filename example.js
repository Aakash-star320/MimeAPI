// test-param-match.js
function testMatch(template, userInput) {
  console.log(`\nTemplate: "${template}"`);
  console.log(`Input: "${userInput}"`);
  
  const paramStart = template.indexOf('{{parameter}}');
  if (paramStart === -1) {
    console.log('No parameter in template');
    return;
  }
  
  const prefix = template.substring(0, paramStart);
  const suffix = template.substring(paramStart + 13);
  
  console.log(`Prefix: "${prefix}" (len=${prefix.length})`);
  console.log(`Suffix: "${suffix}" (len=${suffix.length})`);
  
  const matchesPrefix = userInput.toLowerCase().startsWith(prefix.toLowerCase());
  const matchesSuffix = userInput.toLowerCase().endsWith(suffix.toLowerCase());
  
  console.log(`Prefix match: ${matchesPrefix}`);
  console.log(`Suffix match: ${matchesSuffix}`);
  
  if (matchesPrefix && matchesSuffix) {
    const param = userInput.substring(prefix.length, userInput.length - suffix.length);
    console.log(`✓ MATCH! Parameter: "${param}"`);
  } else {
    console.log('✗ NO MATCH');
  }
}

// Test cases
testMatch("Search Superman on Youtube", "Search Batman on Youtube");
testMatch("Search {{parameter}} on Youtube", "Search Flash on Youtube");
testMatch("Search For Flash On Youtube", "Search For Batman On Youtube");