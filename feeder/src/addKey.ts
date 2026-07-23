import * as keystore from './keystore'
import * as promptly from 'promptly'
import * as fs from 'fs'

function readSecret(name: string, fileName: string): string {
  const value = process.env[name] || ''
  if (value) {
    return value
  }

  const path = process.env[fileName] || ''
  if (!path) {
    return ''
  }

  return fs.readFileSync(path, 'utf8').trim()
}

export async function addKey(filePath: string, coinType: string, keyName: string): Promise<void> {
  let password = readSecret('ORACLE_FEEDER_PASSWORD', 'ORACLE_FEEDER_PASSWORD_FILE')
  let mnemonic =
    readSecret('ORACLE_FEEDER_MNEMONIC', 'ORACLE_FEEDER_MNEMONIC_FILE') ||
    readSecret('ORACLE_FEEDER_MNENOMIC', 'ORACLE_FEEDER_MNENOMIC_FILE')

  coinType = process.env.ORACLE_FEEDER_COIN_TYPE ? process.env.ORACLE_FEEDER_COIN_TYPE : coinType
  keyName = process.env.ORACLE_FEEDER_KEY_NAME ? process.env.ORACLE_FEEDER_KEY_NAME : keyName

  if (password === '') {
    password = await promptly.password(`Enter a passphrase to encrypt your key to disk:`, {
      replace: `*`,
    })
    const confirm = await promptly.password(`Repeat the passphrase:`, { replace: `*` })

    if (password !== confirm) {
      console.error(`ERROR: passphrases don't matchPassword confirm failed`)
      return
    }
  }

  if (password.length < 8) {
    console.error(`ERROR: password must be at least 8 characters`)
    return
  }

  if (mnemonic === '') {
    mnemonic = await promptly.prompt(`Enter your bip39 mnemonic: `)
  }

  if (mnemonic.trim().split(` `).length !== 24) {
    console.error(`Error: Mnemonic is not valid.`)
    return
  }

  await keystore.save(filePath, keyName, password, mnemonic, coinType)
  console.info(`saved!`)
}
