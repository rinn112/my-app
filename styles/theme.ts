// styles/theme.ts
import { Platform } from 'react-native';

export const theme = {
  colors: {
    bg: '#FEF3F7',      // 背景
    card: '#FFFFFF',    // 要素のベース
    text: '#111111',
    muted: '#666666',
    border: '#FFD3EA',
    primary: '#FF2EDA', // アクセント
    link: '#FF2EDA',
  },
  radius: 20,
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  shadowLg: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  fonts: {
    // 本文（以前のフォント）
    body: Platform.select({
      ios: 'SawarabiMincho',
      android: 'SawarabiMincho-Regular',
      default: undefined,
    }),
    // 見出し（←“もう一個”にしたい方はこちらを変更）
    heading: Platform.select({
      ios: 'Hiragino Sans',          // 好みのフォント名に変更可
      android: 'NotoSansJP-Regular', // なければ System にフォールバック
      default: undefined,
    }),
  },
} as const;
