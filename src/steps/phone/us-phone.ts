export const US_PHONE_VALIDATION_MESSAGE = "Ingrese un número de teléfono válido de Estados Unidos.";

export function normalizeUsPhoneNumber(value: string): string | undefined {
  const trimmedValue = value.trim();
  const digitsOnly = value.replace(/\D/g, "");
  const startsWithPlus = trimmedValue.startsWith("+");

  if (digitsOnly.length === 0) {
    return undefined;
  }

  if (startsWithPlus && !digitsOnly.startsWith("1")) {
    return undefined;
  }

  const hasUsPrefix = startsWithPlus || trimmedValue.startsWith("1");
  const nationalNumber = hasUsPrefix && digitsOnly.startsWith("1") ? digitsOnly.slice(1) : digitsOnly;

  if (nationalNumber.length !== 10) {
    return undefined;
  }

  return `+1${nationalNumber}`;
}
