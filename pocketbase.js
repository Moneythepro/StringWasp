// PocketBase Client Setup
const pb = new PocketBase("https://stringwasp-backend.onrender.com");

// Helper: Get current user
function getCurrentUser() {
    return pb.authStore.model;  // Returns user data if logged in
}

// Helper: Login user
async function login(email, password) {
    try {
        await pb.collection('users').authWithPassword(email, password);
        return getCurrentUser();
    } catch (err) {
        console.error("Login failed:", err);
        return null;
    }
}

// Helper: Register new user
async function register(email, password, username) {
    try {
        const user = await pb.collection('users').create({
            email,
            password,
            passwordConfirm: password,
            username
        });
        return user;
    } catch (err) {
        console.error("Registration failed:", err);
        return null;
    }
}
