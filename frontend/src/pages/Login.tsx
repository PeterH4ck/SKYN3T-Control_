import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  Box,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Typography,
  Alert,
  CircularProgress,
  Paper
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AccountCircle,
  Lock
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { useAppDispatch } from '../hooks/redux';
import { login } from '../store/slices/authSlice';
import { authService } from '../services/auth';

// Estilos personalizados
const Background = styled('div')({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundImage: 'url(/images/login-background.jpeg)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  filter: 'blur(2px)',
  transform: 'scale(1.1)',
  transition: 'all 0.5s ease',
  '&.blur-more': {
    filter: 'blur(10px)'
  }
});

const Overlay = styled('div')({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(22, 33, 62, 0.9) 50%, rgba(15, 52, 96, 0.9) 100%)',
  zIndex: 1
});

const ParticlesContainer = styled('div')({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  overflow: 'hidden',
  zIndex: 2
});

const Particle = styled('div')({
  position: 'absolute',
  background: 'rgba(19, 125, 197, 0.6)',
  borderRadius: '50%',
  pointerEvents: 'none',
  animation: 'float 15s infinite linear',
  '@keyframes float': {
    from: {
      transform: 'translateY(100vh) rotate(0deg)',
      opacity: 0
    },
    '10%': {
      opacity: 1
    },
    '90%': {
      opacity: 1
    },
    to: {
      transform: 'translateY(-100vh) rotate(720deg)',
      opacity: 0
    }
  }
});

const LoginContainer = styled(Box)({
  position: 'relative',
  width: '100%',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10
});

const LoginBox = styled(Paper)({
  background: 'rgba(55, 65, 79, 0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '20px',
  padding: '30px 40px',
  width: '400px',
  boxShadow: '0 8px 32px rgba(13, 15, 19, 0.3)',
  border: '1px solid rgba(33, 153, 234, 0.2)',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-5px)',
    boxShadow: '0 15px 40px rgba(13, 15, 19, 0.4)'
  }
});

const Logo = styled('img')({
  maxWidth: '250px',
  height: 'auto',
  filter: 'drop-shadow(0 0 10px rgba(19, 125, 197, 0.5))',
  transition: 'all 0.3s ease',
  userSelect: 'none',
  '&:hover': {
    transform: 'scale(1.03)',
    filter: 'drop-shadow(0 0 55px rgba(19, 125, 197, 0.8))'
  }
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    background: 'rgba(15, 95, 150, 0.1)',
    borderRadius: '10px',
    '& fieldset': {
      borderColor: 'rgba(33, 153, 234, 0.3)',
      borderWidth: '2px'
    },
    '&:hover fieldset': {
      borderColor: 'rgba(33, 153, 234, 0.5)'
    },
    '&.Mui-focused fieldset': {
      borderColor: '#137DC5',
      boxShadow: '0 0 15px rgba(19, 125, 197, 0.3)'
    }
  },
  '& .MuiInputLabel-root': {
    color: 'rgba(255, 255, 255, 0.7)'
  },
  '& .MuiOutlinedInput-input': {
    color: '#ffffff'
  }
});

const LoginButton = styled(Button)({
  width: '100%',
  padding: '15px',
  background: 'linear-gradient(135deg, #137DC5, #2199ea)',
  borderRadius: '10px',
  fontSize: '18px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  position: 'relative',
  overflow: 'hidden',
  '&:before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '-100%',
    width: '100%',
    height: '100%',
    background: 'rgba(255, 255, 255, 0.3)',
    transition: 'left 0.5s ease'
  },
  '&:hover:before': {
    left: '100%'
  },
  '&:hover': {
    transform: 'scale(1.02)',
    boxShadow: '0 5px 20px rgba(19, 125, 197, 0.4)'
  },
  '&:active': {
    transform: 'scale(0.98)'
  },
  '&:disabled': {
    background: 'rgba(255, 255, 255, 0.2)',
    cursor: 'not-allowed',
    transform: 'none',
    boxShadow: 'none'
  }
});

const FooterText = styled(Typography)({
  color: '#2199ea',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '2px',
  fontWeight: 500,
  opacity: 0.8,
  transition: 'all 0.3s ease',
  cursor: 'pointer',
  '&:hover': {
    opacity: 1,
    color: '#137DC5',
    textShadow: '0 0 10px rgba(19, 125, 197, 0.5)'
  }
});

// Schema de validación
const schema = yup.object({
  username: yup.string().required('Usuario requerido'),
  password: yup.string().required('Contraseña requerida'),
  remember: yup.boolean()
});

interface LoginFormData {
  username: string;
  password: string;
  remember: boolean;
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setFocus
  } = useForm<LoginFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      remember: false
    }
  });

  useEffect(() => {
    // Crear partículas animadas
    const particlesContainer = document.getElementById('particles');
    if (particlesContainer) {
      for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.width = `${Math.random() * 5 + 2}px`;
        particle.style.height = particle.style.width;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particle.style.animationDuration = `${Math.random() * 10 + 15}s`;
        particlesContainer.appendChild(particle);
      }
    }

    // Focus en el campo username
    setFocus('username');

    // Verificar sesión existente
    authService.checkSession().then(response => {
      if (response.authenticated) {
        navigate('/dashboard');
      }
    }).catch(() => {
      // Ignorar error, usuario no autenticado
    });
  }, [setFocus, navigate]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      setLoading(true);
      setError('');

      const background = document.getElementById('background');
      background?.classList.add('blur-more');

      const result = await dispatch(login({
        username: data.username,
        password: data.password,
        remember: data.remember
      })).unwrap();

      if (result.requires_2fa) {
        setRequires2FA(true);
        setUserId(result.user_id);
      } else {
        // Login exitoso
        navigate(result.redirect || '/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
      const loginBox = document.querySelector('.login-box');
      loginBox?.classList.add('shake');
      setTimeout(() => {
        loginBox?.classList.remove('shake');
      }, 500);
    } finally {
      setLoading(false);
      const background = document.getElementById('background');
      setTimeout(() => {
        background?.classList.remove('blur-more');
      }, 1000);
    }
  };

  const handle2FASubmit = async (code: string) => {
    try {
      setLoading(true);
      setError('');

      const result = await authService.login({
        username: userId,
        password: '',
        two_factor_code: code
      });

      dispatch(login(result));
      navigate(result.redirect || '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Background id="background" className="background" />
      <Overlay />
      <ParticlesContainer id="particles" />
      
      <LoginContainer>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <LoginBox className="login-box">
            <Box textAlign="center" mb={2}>
              <Logo src="/images/logo.png" alt="SKYN3T Logo" />
            </Box>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              </motion.div>
            )}

            {!requires2FA ? (
              <form onSubmit={handleSubmit(onSubmit)}>
                <StyledTextField
                  fullWidth
                  label="Usuario"
                  placeholder="Ingresa tu usuario"
                  margin="normal"
                  {...register('username')}
                  error={!!errors.username}
                  helperText={errors.username?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AccountCircle sx={{ color: '#2199ea' }} />
                      </InputAdornment>
                    )
                  }}
                />

                <StyledTextField
                  fullWidth
                  type={showPassword ? 'text' : 'password'}
                  label="Contraseña"
                  placeholder="Ingresa tu contraseña"
                  margin="normal"
                  {...register('password')}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock sx={{ color: '#2199ea' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          sx={{ color: '#2199ea' }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />

                <Box display="flex" justifyContent="space-between" alignItems="center" my={2}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        {...register('remember')}
                        sx={{
                          color: '#2199ea',
                          '&.Mui-checked': {
                            color: '#137DC5'
                          }
                        }}
                      />
                    }
                    label={<Typography sx={{ color: '#fff', fontSize: 14 }}>Recuérdame</Typography>}
                  />
                  <Link
                    to="/forgot-password"
                    style={{
                      color: '#2199ea',
                      textDecoration: 'none',
                      fontSize: 14,
                      transition: 'color 0.3s ease'
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </Box>

                <LoginButton
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  startIcon={loading && <CircularProgress size={20} color="inherit" />}
                >
                  {loading ? 'Verificando...' : 'Ingresar'}
                </LoginButton>
              </form>
            ) : (
              <TwoFactorForm onSubmit={handle2FASubmit} loading={loading} />
            )}

            <Box textAlign="center" mt={3}>
              <Typography sx={{ color: '#fff', fontSize: 14 }}>
                ¿No tienes cuenta?{' '}
                <Link
                  to="/register"
                  style={{
                    color: '#2199ea',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  Regístrate aquí
                </Link>
              </Typography>
            </Box>

            <Box
              mt={4}
              pt={3}
              borderTop="1px solid rgba(33, 153, 234, 0.2)"
              textAlign="center"
            >
              <FooterText>
                SKYN3T - IT & NETWORK SOLUTIONS
              </FooterText>
            </Box>
          </LoginBox>
        </motion.div>
      </LoginContainer>

      <style>{`
        .particle {
          position: absolute;
          background: rgba(19, 125, 197, 0.6);
          border-radius: 50%;
          pointer-events: none;
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </>
  );
};

// Componente para 2FA
const TwoFactorForm: React.FC<{
  onSubmit: (code: string) => void;
  loading: boolean;
}> = ({ onSubmit, loading }) => {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      onSubmit(code);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Typography variant="h6" sx={{ color: '#fff', mb: 2, textAlign: 'center' }}>
        Verificación de dos factores
      </Typography>
      <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 3, textAlign: 'center' }}>
        Ingresa el código de 6 dígitos de tu aplicación autenticadora
      </Typography>
      
      <StyledTextField
        fullWidth
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        inputProps={{
          maxLength: 6,
          style: { textAlign: 'center', fontSize: 24, letterSpacing: 8 }
        }}
        autoFocus
      />

      <LoginButton
        type="submit"
        variant="contained"
        disabled={loading || code.length !== 6}
        sx={{ mt: 3 }}
      >
        {loading ? 'Verificando...' : 'Verificar'}
      </LoginButton>
    </form>
  );
};