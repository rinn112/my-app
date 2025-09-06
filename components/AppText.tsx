// components/AppText.tsx
import React from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

const AppText = (props: TextProps) => {
  return <Text {...props} style={[styles.text, props.style]} />;
};

const styles = StyleSheet.create({
  text: {
    fontFamily: 'SawarabiMincho',
    includeFontPadding: false, // Androidで上下の余白を削除
    paddingHorizontal: 2,      // 横に余白を入れて最後の文字欠けを防ぐ
    textAlignVertical: 'center',
  },
});

export default AppText;
