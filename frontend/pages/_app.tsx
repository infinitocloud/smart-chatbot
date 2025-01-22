// pages/_app.tsx

import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { AuthProvider } from '../components/AuthProvider';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      {/* Quitamos la envoltura <div className="h-screen w-full"> */}
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;

