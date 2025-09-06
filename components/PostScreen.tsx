import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Alert, Button, Image, ScrollView, StyleSheet, TextInput } from 'react-native';

export default function PostScreen({ onPost }: { onPost: (post: any) => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: (ImagePicker as any).MediaType?.Images ?? (ImagePicker as any).MediaTypeOptions?.Images ?? 'images',
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!title || !description || !image) {
      Alert.alert('すべての項目を入力してください');
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('位置情報の許可が必要です');
      return;
    }

    const location = await Location.getCurrentPositionAsync({});

    const newPost = {
      id: Date.now(),
      title,
      description,
      image,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    onPost(newPost);

    setImage(null);
    setTitle('');
    setDescription('');
    Alert.alert('投稿しました！');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button title="写真を選ぶ" onPress={pickImage} />
      {image && <Image source={{ uri: image }} style={styles.image} />}
      <TextInput
        placeholder="タイトル"
        value={title}
        onChangeText={setTitle}
        style={styles.input}
      />
      <TextInput
        placeholder="説明"
        value={description}
        onChangeText={setDescription}
        style={styles.input}
        multiline
      />
      <Button title="投稿する" onPress={handleSubmit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 10,
  },
});
