use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum VdfValue {
    Str(String),
    Obj(HashMap<String, VdfValue>),
}

impl VdfValue {
    pub fn get_str(&self, key: &str) -> Option<&str> {
        match self {
            VdfValue::Obj(map) => match map.get(key) {
                Some(VdfValue::Str(s)) => Some(s.as_str()),
                _ => None,
            },
            _ => None,
        }
    }

    pub fn get_obj(&self, key: &str) -> Option<&HashMap<String, VdfValue>> {
        match self {
            VdfValue::Obj(map) => match map.get(key) {
                Some(VdfValue::Obj(inner)) => Some(inner),
                _ => None,
            },
            _ => None,
        }
    }
}

pub fn parse_vdf(text: &str) -> HashMap<String, VdfValue> {
    let tokens = tokenize(text);
    let mut pos = 0;
    parse_tokens(&tokens, &mut pos)
}

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();

    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
        } else if ch == '/' {
            chars.next();
            if chars.peek() == Some(&'/') {
                chars.next();
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
        } else if ch == '{' || ch == '}' {
            tokens.push(ch.to_string());
            chars.next();
        } else if ch == '"' {
            chars.next();
            let mut s = String::new();
            while let Some(c) = chars.next() {
                if c == '\\' {
                    if let Some(next_c) = chars.next() {
                        s.push(next_c);
                    }
                } else if c == '"' {
                    break;
                } else {
                    s.push(c);
                }
            }
            tokens.push(s);
        } else {
            let mut s = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_whitespace() || c == '{' || c == '}' || c == '"' {
                    break;
                }
                s.push(c);
                chars.next();
            }
            if !s.is_empty() {
                tokens.push(s);
            }
        }
    }
    tokens
}

fn parse_tokens(tokens: &[String], pos: &mut usize) -> HashMap<String, VdfValue> {
    let mut map = HashMap::new();
    while *pos < tokens.len() {
        let token = &tokens[*pos];
        if token == "}" {
            *pos += 1;
            break;
        }
        let key = token.clone();
        *pos += 1;
        if *pos >= tokens.len() {
            break;
        }
        let next_token = &tokens[*pos];
        if next_token == "{" {
            *pos += 1;
            let child_obj = parse_tokens(tokens, pos);
            map.insert(key, VdfValue::Obj(child_obj));
        } else if next_token == "}" {
            *pos += 1;
            break;
        } else {
            let val = next_token.clone();
            *pos += 1;
            map.insert(key, VdfValue::Str(val));
        }
    }
    map
}
