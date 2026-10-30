export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
