use keyring::{Entry, Error};

const SERVICE: &str = "io.github.vshakitskiy.typos.ai";
const ACCOUNT: &str = "api-key";

fn entry() -> Result<Entry, String> {
  Entry::new(SERVICE, ACCOUNT).map_err(|e| {
    eprintln!("typos: не удалось открыть хранилище ключей: {e}");
    "Не удалось открыть хранилище ключей. Проверь системное хранилище секретов и попробуй снова.".into()
  })
}

/// Проверяет ключ до обращения к хранилищу: пустой ключ означает удаление.
fn checked_key(key: &str) -> Result<Option<&str>, String> {
  let key = key.trim();
  if key.is_empty() {
    return Ok(None);
  }
  if key.len() > 4096 {
    return Err("Ключ слишком длинный — проверь, что скопировал только ключ.".into());
  }
  Ok(Some(key))
}

#[tauri::command]
pub fn ai_key_get() -> Result<Option<String>, String> {
  match entry()?.get_password() {
    Ok(key) => Ok(Some(key)),
    Err(Error::NoEntry) => Ok(None),
    Err(e) => {
      eprintln!("typos: не удалось прочитать ключ: {e}");
      Err("Не удалось прочитать ключ. Проверь системное хранилище секретов и попробуй снова.".into())
    }
  }
}

#[tauri::command]
pub fn ai_key_set(key: String) -> Result<(), String> {
  let Some(key) = checked_key(&key)? else {
    return ai_key_delete();
  };
  entry()?.set_password(key).map_err(|e| {
    eprintln!("typos: не удалось сохранить ключ: {e}");
    "Не удалось сохранить ключ. Проверь системное хранилище секретов и попробуй снова.".into()
  })
}

#[tauri::command]
pub fn ai_key_delete() -> Result<(), String> {
  match entry()?.delete_credential() {
    Ok(()) | Err(Error::NoEntry) => Ok(()),
    Err(e) => {
      eprintln!("typos: не удалось удалить ключ: {e}");
      Err("Не удалось удалить ключ. Проверь системное хранилище секретов и попробуй снова.".into())
    }
  }
}

#[cfg(test)]
mod tests {
  use super::checked_key;

  #[test]
  fn пустой_ключ_означает_удаление() {
    assert_eq!(checked_key("  \n"), Ok(None));
  }

  #[test]
  fn ключ_обрезается_и_проверяется_по_длине() {
    assert_eq!(checked_key(" sk-1 "), Ok(Some("sk-1")));
    assert!(checked_key(&"x".repeat(4097)).is_err());
  }
}
