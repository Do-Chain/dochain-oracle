# Security Policy

## Reporting A Vulnerability

Please do not open public issues for suspected security vulnerabilities.

Email the maintainers with:

- affected component and version or commit SHA
- steps to reproduce or proof of concept
- expected impact
- any logs, traces, or screenshots that help triage

The maintainers should acknowledge reports within 3 business days and coordinate fixes privately before public disclosure.

## Supported Versions

Security fixes are prioritized for the active `main` branch and any release branch currently used by DoChain operators.

## Operator Secret Handling

Do not pass feeder mnemonics or keystore passwords as long-lived environment variables in production. Use `ORACLE_FEEDER_PASSWORD_FILE` and `ORACLE_FEEDER_MNEMONIC_FILE` with files mounted from a secret manager.

Fixed and fallback oracle prices are breakglass mechanisms. If `ORACLE_ALLOW_FIXED_PRICES=true`, operators must also set `ORACLE_FIXED_PRICE_BREAKGLASS_REASON` and a future `ORACLE_FIXED_PRICE_EXPIRES_AT` timestamp. If `ORACLE_ALLOW_FALLBACK_PRICES=true`, operators must set `ORACLE_FALLBACK_PRICE_BREAKGLASS_REASON` and a future `ORACLE_FALLBACK_PRICE_EXPIRES_AT` timestamp.
