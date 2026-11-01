import { Tabs } from 'expo-router';
import React from 'react';

/**
 * N-01: la navegación real es el Sidebar del panel. La barra de pestañas
 * ("Usuario" / "Admin") se mostraba debajo del sidebar del admin y, para el
 * cajero, era una barra con UNA sola pestaña ocupando espacio en el POS.
 * Se mantiene <Tabs> para no tocar rutas, pero sin barra.
 */
export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: 'Usuario' }} />
      <Tabs.Screen name="admin" options={{ title: 'Admin' }} />
    </Tabs>
  );
}
