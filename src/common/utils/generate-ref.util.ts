export function generateReference(prefix = 'NXB'): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${ts}${rand}`;
}

export function generateAccountNumber(): string {
  // US-style 10-digit account number
  return Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
}

export function generateRoutingNumber(): string {
  // NexaBank routing: 021000021 (example fixed)
  return '021000021';
}

export function generateCardNumber(): string {
  // Luhn-valid 16-digit Visa prefix (4)
  const body = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10));
  let sum = 0;
  body.forEach((d, i) => {
    const v = i % 2 === 0 ? d * 2 : d;
    sum += v > 9 ? v - 9 : v;
  });
  const check = (10 - (sum % 10)) % 10;
  return `4${body.slice(1).join('')}${check}`;
}