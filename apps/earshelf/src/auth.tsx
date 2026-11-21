import { SignIn as SharedSignIn, useSession as useSharedSession } from '@wells/auth';
import { supabase } from './supabase';

export { AuthContext, useUser } from '@wells/auth';
export const useSession = () => useSharedSession(supabase);
export function SignIn({ onSkip }: { onSkip?: () => void }) {
  return <SharedSignIn supabase={supabase} brand="earshelf" blurb="Your documents, read aloud. Sign in so your library follows you to every device. New accounts get 7 days of Pro, free." onSkip={onSkip} google={import.meta.env.VITE_GOOGLE_SIGNIN !== 'off'} />;
}
