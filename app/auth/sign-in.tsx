// app/auth/sign-in.tsx
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { theme } from '../../styles/theme';

export default function SignInScreen() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSignIn = async () => {
    const { error } = await signIn(email.trim(), password);
    if (error) Alert.alert('ログイン失敗', error);
  };

  const onReset = async () => {
    if (!email) return Alert.alert('確認', '先にメールを入力してください。');
    const { error } = await resetPassword(email.trim());
    if (error) Alert.alert('送信失敗', error);
    else Alert.alert('送信', '再設定メールを送りました。');
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>ログイン</Text>

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
        placeholder="パスワード"
        placeholderTextColor={theme.colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={s.btnPrimary} onPress={onSignIn}>
        <Text style={s.btnPrimaryT}>ログイン</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onReset}>
        <Text style={s.linkGray}>パスワードをお忘れですか？</Text>
      </TouchableOpacity>

      <Link href="/auth/sign-up" style={s.linkGray}>新規登録へ</Link>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.bg, // 背景のみ。覆う白い枠は無し
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
