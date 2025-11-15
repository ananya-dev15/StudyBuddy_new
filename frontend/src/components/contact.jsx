import React from "react";

export default function Contact() {
  return (
    <div className="contact-page">
      {/* Inline CSS inside React just like Dashboard */}
      <style>{`
        .contact-page {
          margin: 0;
          font-family: 'Poppins', sans-serif;
          background: linear-gradient(135deg, #e0c3fc, #8ec5fc);
          min-height: 100vh;
          padding: 50px 20px;
          color: #333;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .contact-title {
          text-align: center;
          color: #4b0082;
          font-size: 2.5rem;
          margin-bottom: 40px;
        }

        .contact-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 25px;
          width: 100%;
          max-width: 1100px;
        }

        .member-card {
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
          padding: 25px 20px;
          transition: all 0.3s ease;
        }

        .member-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        }

        .member-card h2 {
          color: #4b0082;
          font-size: 1.5rem;
          margin-bottom: 15px;
        }

        .info {
          margin: 8px 0;
          font-size: 1rem;
        }

        .info i {
          color: #8a2be2;
          margin-right: 8px;
        }

        .info a {
          text-decoration: none;
          color: #333;
          font-weight: 500;
        }

        .info a:hover {
          color: #8a2be2;
        }

        @media (max-width: 600px) {
          .contact-title {
            font-size: 2rem;
          }
        }
      `}</style>

      {/* Page Title */}
      <h1 className="contact-title">Meet Our Team - Innovatrix</h1>

      {/* Team Member Grid */}
      <div className="contact-container">

        <div className="member-card">
          <h2>Ankit Kumar</h2>
          <p className="info"><i className="fas fa-phone-alt"></i> +91 9142185818</p>
          <p className="info">
            <i className="fab fa-linkedin"></i>
            <a
              href="https://www.linkedin.com/in/ankit-kumar-22b9772ab"
              target="_blank"
              rel="noreferrer"
            >
              linkedin.com/in/ankit
            </a>
          </p>
          <p className="info">
            <i className="fas fa-envelope"></i>
            <a href="mailto:ankit.2327cse1116@kiet.edu">
              ankit.2327cse1116@kiet.edu
            </a>
          </p>
        </div>

        <div className="member-card">
          <h2>Ananya Srivastava</h2>
          <p className="info"><i className="fas fa-phone-alt"></i> +91 8090812983</p>
          <p className="info">
            <i className="fab fa-linkedin"></i>
            <a href="https://linkedin.com/in/ananya" target="_blank" rel="noreferrer">
              linkedin.com/in/ananya
            </a>
          </p>
          <p className="info">
            <i className="fas fa-envelope"></i>
            <a href="mailto:ananya@gmail.com">
              ananya.2327cs1021@kiet.edu
            </a>
          </p>
        </div>

        <div className="member-card">
          <h2>Setu Arya</h2>
          <p className="info"><i className="fas fa-phone-alt"></i> +91 6205635575</p>
          <p className="info">
            <i className="fab fa-linkedin"></i>
            <a href="https://www.linkedin.com/in/setu-arya" target="_blank" rel="noreferrer">
              linkedin.com/in/setu
            </a>
          </p>
          <p className="info">
            <i className="fas fa-envelope"></i>
            <a href="mailto:setu.2327cse1120@kiet.edu">
              setu.2327cse1120@kiet.edu
            </a>
          </p>
        </div>

        <div className="member-card">
          <h2>Anshika Jain</h2>
          <p className="info"><i className="fas fa-phone-alt"></i> +91 9058202869</p>
          <p className="info">
            <i className="fab fa-linkedin"></i>
            <a
              href="https://www.linkedin.com/in/anshika-jain-bb93972a6"
              target="_blank"
              rel="noreferrer"
            >
              linkedin.com/in/anshika
            </a>
          </p>
          <p className="info">
            <i className="fas fa-envelope"></i>
            <a href="mailto:anshikahjain2205@gmail.com">
              anshikahjain2205@gmail.com
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
