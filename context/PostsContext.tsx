import React, { createContext, ReactNode, useContext, useState } from 'react';

export type Post = {
  id: string;
  latitude: number;
  longitude: number;
  profileImage?: string;
  mainImage?: string;
  topsImage?: string;
  bottomsImage?: string;
  outerwearImage?: string;
  shoesImage?: string;
  category: string; 
};

type PostsContextType = {
  posts: Post[];
  addPost: (post: Omit<Post, 'id'>) => void;
};

const PostsContext = createContext<PostsContextType | undefined>(undefined);

export const PostsProvider = ({ children }: { children: ReactNode }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const addPost = (post: Omit<Post, 'id'>) => {
    const id = Date.now().toString();
    setPosts((prev) => [...prev, { id, ...post }]);
  };
  return (
    <PostsContext.Provider value={{ posts, addPost }}>
      {children}
    </PostsContext.Provider>
  );
};

export const usePosts = () => {
  const context = useContext(PostsContext);
  if (!context) throw new Error('usePosts must be used within a PostsProvider');
  return context;
};
