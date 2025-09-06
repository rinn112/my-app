// app/_layout.tsx 置き換え
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../geoTask';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { PostsProvider } from '../context/PostsContext';
import { RouteProvider } from '../context/RouteContext';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    const inAuth = pathname.startsWith('/auth');
    if (!session && !inAuth) router.replace('/auth/sign-up');
    if (session && inAuth) router.replace('/');
  }, [session, loading, pathname]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SawarabiMincho: require('../assets/fonts/SawarabiMincho-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <PostsProvider>
          <RouteProvider>
            <AuthGate>
              {/* ← 子スクリーン名を列挙しない（自動検出） */}
              <Stack screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
            </AuthGate>
          </RouteProvider>
        </PostsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
