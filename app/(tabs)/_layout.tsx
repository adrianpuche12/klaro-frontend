import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '../../components/HapticTab';
import { IconSymbol } from '../../components/ui/IconSymbol';
import TabBarBackground from '../../components/ui/TabBarBackground';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useAuth } from '../../context/AuthContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { roles, canManageUsers } = useAuth();
  // SPRINT-14: Keycloak ya no distingue admin/user -- canManageUsers viene
  // del Role asignado en la app. root siempre true.
  const isAdmin = roles.includes('root') || canManageUsers;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Usuario',
          tabBarIcon: ({ color }) => (
            <IconSymbol 
              size={28} 
              name="person.fill" 
              color={color} 
            />
          ),
          
        }}
      />

      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color }) => (
            <IconSymbol 
              size={28} 
              name="chevron.left.forwardslash.chevron.right" 
              color={color} 
            />
          ),
          href: isAdmin ? '/admin' : null,
          tabBarStyle: !isAdmin ? { display: 'none' } : undefined
        }}
      />
    </Tabs>
  );
}