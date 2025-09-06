// app/auth/sign-up.tsx
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { theme } from '../../styles/theme';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSignUp = async () => {
    const { error } = await signUp(email.trim(), password);
    if (error) Alert.alert('登録失敗', error);
    else router.push('/auth/profile-setup');
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>新規登録</Text>

      <TextInput
        style={s.inp}
        placeholder="メールアドレス"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.inp}
        placeholder="パスワード（6文字以上）"
        placeholderTextColor={theme.colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={s.btnPrimary} onPress={onSignUp}>
        <Text style={s.btnPrimaryT}>登録</Text>
      </TouchableOpacity>

      <Link href="/auth/sign-in" style={s.linkGray}>ログインへ</Link>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.bg, // 覆う白い枠は無し
  },
  title: {
    fontSize: 22,
    color: theme.colors.text,
    marginBottom: 16,
    fontFamily: theme.fonts.body, // 本文と同フォント
    fontWeight: '400',            // 太字にしない
  },
  inp: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 12,
    borderWidth: 0,
    ...theme.shadow,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: theme.radius,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPrimaryT: { color: '#fff', fontWeight: '800' },
  linkGray: {
    marginTop: 14,
    color: theme.colors.muted, // グレー
    fontWeight: '400',
  },
});
