/**
 * Format price in INR from paisa to display string.
 * priceInPaisa: 10000 -> "₹100"
 */
export function formatPriceINR(priceInPaisa: number): string {
  const rupees = priceInPaisa / 100;
  return `\u20B9${rupees.toLocaleString("en-IN")}`;
}
