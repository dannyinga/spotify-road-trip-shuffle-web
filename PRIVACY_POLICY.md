# Privacy Policy for Road Trip Shuffle

**Effective Date:** June 3, 2026

Welcome to **Road Trip Shuffle** ("we," "our," or "us"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application, which integrates with the Spotify Web API.

---

## 1. Information We Collect

To provide our collaborative shuffling features, we interact with the Spotify Web API. When you log in and authorize our application, we collect and access the following information:

### A. Spotify Account Data
* **User Profile Information:** Your Spotify display name, email address, profile image (avatar), and Spotify user ID.
* **Spotify Playlists:** Access to your public and private playlists (metadata, titles, and track lists) that you explicitly choose to contribute to a road trip cabin.
* **Access Tokens:** Secure authentication tokens provided by Spotify OAuth to query the Spotify API on your behalf.

### B. Cabin & Collaboration Data
* **Trip Details:** Cabin name, generated invite code, joined timestamps, and member roles (Host or Passenger).
* **Weights:** Custom weights selected by the host to determine the proportional contribution of each passenger's songs.
* **Shuffle Recipes:** Saved history of your shuffler configurations (seeds, source playlists, and output playlist names).

*Note: We **never** collect, see, or store your Spotify account password. All authentication is handled directly and securely through Spotify's official OAuth authorization flow.*

---

## 2. How We Use Your Information

We use your data strictly to perform the core functionalities of the application:
* **User Authentication:** To securely log you into the application and link your Spotify account.
* **Collaborative Cabin Management:** To list active crew members, display connected playlists, and compute song shares.
* **Aggregate & Shuffle Playlists:** To pool track URIs from connected crew playlists, apply weight-based proportions, run our shuffling algorithm, and write the resulting shuffled playlist back to the Host's Spotify account.

---

## 3. Data Storage & Security

* **Secure Tokens:** Spotify Access and Refresh Tokens are stored securely in our database using encryption. They are strictly used to call the Spotify API on your behalf.
* **Database Isolation:** All group details and members are hosted in a secure Supabase database using **Row-Level Security (RLS)**. This guarantees that your cabin details, playlist selections, and membership are strictly private to you and the authorized crew members in your cabin.
* **Third Parties:** We **do not** sell, trade, rent, or share your personal data with any third-party marketing services or external platforms.

---

## 4. Retaining and Deleting Your Data

We believe in giving you full control over your data:
* **Leaving or Deleting a Cabin:** When you leave a cabin, your playlist contributions and weight settings are permanently deleted from the active road trip. If you are the Host and delete the cabin, the entire cabin record and its passenger associations are wiped.
* **Deleting Saved Recipes:** You can delete any of your saved shuffle recipes directly from the dashboard cockpit at any time.
* **Revoking Access:** You can revoke Road Trip Shuffle's access to your Spotify account at any time by going to your Spotify Account Settings page under [Apps](https://www.spotify.com/account/apps/).

---

## 5. Contact Us

If you have any questions, concerns, or requests regarding this Privacy Policy, please contact the developer:

* **Developer Email:** [dannyinga.professional@gmail.com]
* **GitHub Repository:** [https://github.com/dannyinga/spotify-road-trip-shuffle-web]
