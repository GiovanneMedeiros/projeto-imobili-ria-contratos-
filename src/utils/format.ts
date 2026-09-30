import type { Property } from '../types/domain'

export function formatDocument(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\.\d{3})(\d)/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\/\d{4})(\d)/, '$1-$2')
}

export function formatPropertyAddress(property: Pick<Property, 'address' | 'number' | 'complement' | 'neighborhood'>) {
  const address = property.address.trim()
  const normalizedAddress = address.toLocaleLowerCase('pt-BR')
  const additionalParts = [property.number && `nº ${property.number}`, property.complement, property.neighborhood].filter((part): part is string => Boolean(part?.trim()))
  const missingParts = additionalParts.filter((part) => {
    const normalizedPart = part.toLocaleLowerCase('pt-BR')
    const numberWithoutPrefix = normalizedPart.replace(/^nº\s*/, '')
    return !normalizedAddress.includes(normalizedPart) && !(normalizedPart.startsWith('nº ') && normalizedAddress.includes(numberWithoutPrefix))
  })
  return [address, ...missingParts].filter(Boolean).join(', ')
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 3) return digits
  const area = digits.slice(0, 2)
  const number = digits.slice(2)
  return number.length > 8
    ? `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`
    : `(${area}) ${number.slice(0, 4)}${number.length > 4 ? `-${number.slice(4)}` : ''}`
}

export function formatCurrency(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function isValidCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '')
  if (/^(\d)\1+$/.test(digits)) return false
  if (digits.length === 11) {
    const calculate = (length: number) => {
      const sum = digits.slice(0, length).split('').reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0)
      const remainder = (sum * 10) % 11
      return remainder === 10 ? 0 : remainder
    }
    return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10])
  }
  if (digits.length === 14) {
    const calculate = (numbers: string, weights: number[]) => {
      const sum = numbers.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
      const remainder = sum % 11
      return remainder < 2 ? 0 : 11 - remainder
    }
    const first = calculate(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    const second = calculate(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return first === Number(digits[12]) && second === Number(digits[13])
  }
  return false
}

export function validateContractFields(keys: string[], values: Record<string, string>) {
  const missing = keys.find((key) => !key.startsWith('opcional_') && !values[key]?.trim())
  if (missing) return `Preencha o campo "${missing.replaceAll('_', ' ')}" antes de gerar o contrato.`

  for (const key of keys.filter((field) => !field.startsWith('opcional_') && /cpf|cnpj/i.test(field))) {
    if (!isValidCpfCnpj(values[key])) return `Confira o CPF/CNPJ informado em "${key.replaceAll('_', ' ')}".`
  }

  const start = keys.find((key) => /data_inicio|data_inicial/i.test(key))
  const end = keys.find((key) => /data_fim|data_final/i.test(key))
  if (start && end && new Date(`${values[end]}T00:00:00`) <= new Date(`${values[start]}T00:00:00`)) {
    return 'A data final precisa ser posterior à data inicial.'
  }
  return null
}