import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/',
    // We handle sign in via modal, not a separate page
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      try {
        // Upsert user in database
        await prisma.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name,
            image: user.image,
          },
          create: {
            email: user.email,
            name: user.name,
            image: user.image,
            preferredCategories: ['politics', 'technology', 'sports'],
            preferredCountry: 'eg',
          },
        });
        return true;
      } catch (error) {
        console.error('Error saving user:', error);
        return true; // Still allow sign in even if DB save fails
      }
    },
    async session({ session, token }) {
      if (session.user?.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: session.user.email },
          });
          if (dbUser) {
            (session.user as any).id = dbUser.id;
            (session.user as any).preferredCategories = dbUser.preferredCategories;
            (session.user as any).preferredCountry = dbUser.preferredCountry;
          }
        } catch (error) {
          console.error('Error fetching user session:', error);
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
