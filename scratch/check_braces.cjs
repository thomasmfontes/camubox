const fs = require('fs');
const content = fs.readFileSync('src/pages/UserMyLockers.jsx', 'utf8');
let balance = 0;
let pBalance = 0;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') balance++;
        if (char === '}') balance--;
        if (char === '(') pBalance++;
        if (char === ')') pBalance--;
        if (balance < 0) {
            console.log(`Brace mismatch at line ${i + 1}: balance is ${balance}`);
            process.exit(1);
        }
        if (pBalance < 0) {
            console.log(`Paren mismatch at line ${i + 1}: balance is ${pBalance}`);
            process.exit(1);
        }
    }
}
console.log(`Final balance: Braces=${balance}, Parens=${pBalance}`);
