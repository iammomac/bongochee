export const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);
